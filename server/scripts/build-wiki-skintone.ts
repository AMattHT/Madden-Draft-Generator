/**
 * One-time builder: derive skin tone (1-7) from each player's Wikipedia photo for
 * players who have NO Madden portrait (so they'd otherwise only get a position-
 * weighted guess). Emits data/lookups/wiki_skintone.json keyed by "normName|year".
 *
 * Same method as build-skintone.ts: YCbCr skin detection + ITA classification.
 * Wikipedia photos vary (headshots, ceremonies), so this is a best-effort fallback
 * that's still far better than a demographic guess.
 *
 * Run: npx tsx scripts/build-wiki-skintone.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PlayerLookupService } from '../src/services/PlayerLookupService';
import { DerivedSkinToneService } from '../src/services/DerivedSkinToneService';
import { LOOKUPS_DIR } from '../src/config/paths';
import { normalizeName } from '../src/util/csv';

function ita([r, g, b]: number[]): number {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return (Math.atan2(116 * f(Y) - 16 - 50, 200 * (f(Y) - f(Z))) * 180) / Math.PI;
}
const itaToTone = (v: number) => (v >= 25 ? 1 : v >= 5 ? 2 : v >= -10 ? 3 : v >= -25 ? 4 : v >= -38 ? 5 : v >= -48 ? 6 : 7);

// Wikimedia asks for a descriptive User-Agent and hard-throttles bulk image fetches
// (HTTP 429). We crawl serially with retry-on-429 backoff, honoring Retry-After.
const UA = 'Madden26DraftClassGenerator/1.0 (personal draft-class tool; skin-tone sampling)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchImage(url: string): Promise<Buffer | null> {
  const backoff = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
      if (res.status === 429 && attempt < backoff.length) {
        const ra = Number(res.headers.get('retry-after')) * 1000;
        await sleep(Number.isFinite(ra) && ra > 0 ? ra : backoff[attempt]);
        continue;
      }
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      if (attempt < backoff.length) { await sleep(backoff[attempt]); continue; }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function sampleTone(url: string): Promise<number | null> {
  try {
    const buf = await fetchImage(url);
    if (!buf) return null;
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    for (let y = Math.floor(0.12 * H); y < 0.62 * H; y++)
      for (let x = Math.floor(0.25 * W); x < 0.75 * W; x++) {
        const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
        const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        if (Cb >= 77 && Cb <= 133 && Cr >= 133 && Cr <= 177 && r > 30) { rs.push(r); gs.push(g); bs.push(b); }
      }
    if (rs.length < 60) return null;
    const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return itaToTone(ita([med(rs), med(gs), med(bs)]));
  } catch {
    return null;
  }
}

(async () => {
  const dst = path.join(LOOKUPS_DIR, 'wiki_skintone.json');
  // Resume: keep everything already sampled; only fetch the not-yet-done ones.
  const out: Record<string, number> = (() => { try { return JSON.parse(fs.readFileSync(dst, 'utf8')); } catch { return {}; } })();

  // allTimeGreats returns players greatness-sorted, so the most notable legends are
  // fetched first — a partial run still covers the players you'll actually see.
  const all = PlayerLookupService.allTimeGreats(100000);
  const targets = all.filter((p) => {
    if (!p.wikiImageUrl || DerivedSkinToneService.toneForPid(p.photoId) != null) return false;
    return !(`${normalizeName(`${p.firstName}${p.lastName}`)}|${p.draftYear}` in out);
  });
  console.log(`${Object.keys(out).length} already done; ${targets.length} to sample…`);

  let done = 0, ok = 0;
  for (const p of targets) {
    const tone = await sampleTone(p.wikiImageUrl!);
    done++;
    if (tone != null) { out[`${normalizeName(`${p.firstName}${p.lastName}`)}|${p.draftYear}`] = tone; ok++; }
    if (done % 50 === 0) { fs.writeFileSync(dst, JSON.stringify(out)); console.log(`  ${done}/${targets.length} (${ok} new ok, ${Object.keys(out).length} total)`); }
    await sleep(400); // serial + polite
  }
  fs.writeFileSync(dst, JSON.stringify(out));
  console.log(`\ntotal entries: ${Object.keys(out).length} (+${ok} this run)`);
  console.log(`wrote ${dst}`);
})();
