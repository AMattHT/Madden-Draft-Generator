/**
 * Wikipedia skin-tone crawler (resumable, outcome-cached).
 *
 * Samples a Wikipedia headshot (YCbCr skin detection + ITA) for players who have
 * NO Madden portrait, and records the OUTCOME of every attempt in the SQLite
 * `wiki_skintone` cache so re-runs skip both successes AND known dead ends and only
 * re-try transient failures (429 / network). Wikimedia hard-throttles bulk fetches,
 * so this is serial + polite + retry-with-backoff.
 *
 *   npx tsx scripts/build-wiki-skintone.ts
 *
 * On finish it also exports the 'ok' tones to data/lookups/wiki_skintone.json (the
 * committed, portable fallback consumed by WikiSkinToneService on fresh clones).
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PlayerLookupService } from '../src/services/PlayerLookupService';
import { DerivedSkinToneService } from '../src/services/DerivedSkinToneService';
import { LOOKUPS_DIR } from '../src/config/paths';
import { normalizeName } from '../src/util/csv';
import { getDb } from '../src/db';

const UA = 'Madden26DraftClassGenerator/1.0 (personal draft-class tool; skin-tone sampling)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ita([r, g, b]: number[]): number {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return (Math.atan2(116 * f(Y) - 16 - 50, 200 * (f(Y) - f(Z))) * 180) / Math.PI;
}
const itaToTone = (v: number) => (v >= 25 ? 1 : v >= 5 ? 2 : v >= -10 ? 3 : v >= -25 ? 4 : v >= -38 ? 5 : v >= -48 ? 6 : 7);

type Fetched = { kind: 'ok'; buf: Buffer } | { kind: 'gone' } | { kind: 'retry' };
async function fetchImage(url: string): Promise<Fetched> {
  const backoff = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
      if (res.status === 429) {
        if (attempt >= backoff.length) return { kind: 'retry' };
        const ra = Number(res.headers.get('retry-after')) * 1000;
        await sleep(Number.isFinite(ra) && ra > 0 ? ra : backoff[attempt]);
        continue;
      }
      if (!res.ok) return { kind: 'gone' }; // 404 / other permanent
      return { kind: 'ok', buf: Buffer.from(await res.arrayBuffer()) };
    } catch {
      if (attempt >= backoff.length) return { kind: 'retry' };
      await sleep(backoff[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }
  return { kind: 'retry' };
}

type Outcome = { outcome: 'ok' | 'no_skin' | 'gone' | 'retry'; tone: number | null };
async function attempt(url: string): Promise<Outcome> {
  const f = await fetchImage(url);
  if (f.kind === 'gone') return { outcome: 'gone', tone: null };
  if (f.kind === 'retry') return { outcome: 'retry', tone: null };
  try {
    const { data, info } = await sharp(f.buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    for (let y = Math.floor(0.12 * H); y < 0.62 * H; y++)
      for (let x = Math.floor(0.25 * W); x < 0.75 * W; x++) {
        const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
        const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        if (Cb >= 77 && Cb <= 133 && Cr >= 133 && Cr <= 177 && r > 30) { rs.push(r); gs.push(g); bs.push(b); }
      }
    if (rs.length < 60) return { outcome: 'no_skin', tone: null };
    const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return { outcome: 'ok', tone: itaToTone(ita([med(rs), med(gs), med(bs)])) };
  } catch {
    return { outcome: 'no_skin', tone: null }; // undecodable image
  }
}

(async () => {
  const db = getDb();
  const jsonPath = path.join(LOOKUPS_DIR, 'wiki_skintone.json');

  // One-time seed: import any prior committed JSON tones into the cache as 'ok'.
  const seedStmt = db.prepare("INSERT OR IGNORE INTO wiki_skintone(key, tone, outcome, attempted_at) VALUES(?, ?, 'ok', ?)");
  try {
    const prior = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, number>;
    const now = Date.now();
    const seed = db.transaction((rows: [string, number][]) => rows.forEach(([k, t]) => seedStmt.run(k, t, now)));
    seed(Object.entries(prior));
  } catch { /* no prior json */ }

  // Terminal outcomes are never re-attempted; 'retry' rows will be re-tried.
  const terminal = new Set(
    (db.prepare("SELECT key FROM wiki_skintone WHERE outcome IN ('ok','no_skin','gone')").all() as { key: string }[]).map((r) => r.key)
  );

  const all = PlayerLookupService.allTimeGreats(100000); // greatness-sorted: notable players first
  const targets = all.filter((p) => {
    if (!p.wikiImageUrl || DerivedSkinToneService.toneForPid(p.photoId) != null) return false;
    return !terminal.has(`${normalizeName(`${p.firstName}${p.lastName}`)}|${p.draftYear}`);
  });
  console.log(`cache: ${terminal.size} terminal; ${targets.length} to (re)attempt`);

  const upsert = db.prepare(
    'INSERT INTO wiki_skintone(key, tone, outcome, attempted_at) VALUES(@key, @tone, @outcome, @at) ' +
    'ON CONFLICT(key) DO UPDATE SET tone=excluded.tone, outcome=excluded.outcome, attempted_at=excluded.attempted_at'
  );
  const exportJson = () => {
    const rows = db.prepare("SELECT key, tone FROM wiki_skintone WHERE outcome='ok' AND tone IS NOT NULL").all() as { key: string; tone: number }[];
    fs.writeFileSync(jsonPath, JSON.stringify(Object.fromEntries(rows.map((r) => [r.key, r.tone]))));
    return rows.length;
  };

  const counts: Record<string, number> = { ok: 0, no_skin: 0, gone: 0, retry: 0 };
  let done = 0;
  for (const p of targets) {
    const key = `${normalizeName(`${p.firstName}${p.lastName}`)}|${p.draftYear}`;
    const { outcome, tone } = await attempt(p.wikiImageUrl!);
    upsert.run({ key, tone, outcome, at: Date.now() });
    counts[outcome]++;
    done++;
    if (done % 50 === 0) { const n = exportJson(); console.log(`  ${done}/${targets.length}  ok:${counts.ok} no_skin:${counts.no_skin} gone:${counts.gone} retry:${counts.retry}  (json ${n})`); }
    await sleep(400);
  }
  const total = exportJson();
  console.log(`\nthis run: ${JSON.stringify(counts)} | wiki_skintone.json now has ${total} tones`);
})();
