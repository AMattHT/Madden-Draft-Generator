/**
 * Bake career rushing for quarterbacks the nflverse draft table cannot see, from
 * their Wikipedia infoboxes.
 *
 *   npx tsx scripts/bake-qb-rushing.ts            # every QB with no nflverse career
 *   npx tsx scripts/bake-qb-rushing.ts --from 1936 --to 1979
 *
 * nflverse's draft_picks.csv (career games, rushing yards) starts with the 1980
 * draft, so Montana, Bradshaw, Staubach and every earlier quarterback had no
 * rushing record; their archetype came from their build and their speed from that
 * archetype (Montana: a lean 6'2" Scrambler at 95). The infobox on a quarterback's
 * page carries "Passing yards" for everyone and "Rushing yards" when he ran enough
 * for an editor to list it; the absence of that row is itself the record of a
 * pocket passer. "Games played" is rarely shown for quarterbacks, so per-game
 * rates are derived from the career span in the lookup (see NflverseCareerService).
 *
 * Output: data/lookups/qb-rushing-wiki.json, keyed `draftYear|normname`, written
 * after every player so an interrupted run resumes where it stopped. Wikipedia
 * rate-limits bursts: 2.5 s between requests, backoff on 429.
 */
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../src/config/paths';
import { normalizeName } from '../src/util/csv';
import { PlayerLookupService } from '../src/services/PlayerLookupService';
import { NflverseCareerService } from '../src/services/NflverseCareerService';

const OUT = path.join(LOOKUPS_DIR, 'qb-rushing-wiki.json');
const UA = { 'User-Agent': 'MaddenDraftClassGenerator/1.3 (personal modding tool; amatthews@hive-tech.co)' };
const SLEEP_MS = 2500;

export interface QbRushingEntry {
  page: string | null; // Wikipedia title that matched, null when no page fit
  passYards: number | null;
  rushYards: number | null; // null = the infobox shows no rushing row
  rushTds: number | null;
  games: number | null; // only when the infobox lists "Games played"
  careerTo: number | null; // from the lookup, for the per-game estimate
  status: 'ok' | 'no-page' | 'not-football' | 'unverified';
}

const args = process.argv.slice(2);
const argNum = (flag: string, dflt: number) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const FROM = argNum('--from', 1936);
const TO = argNum('--to', 2025);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function parsePage(title: string): Promise<{ title: string; html: string } | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&formatversion=2&redirects=1`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429) { await sleep(6000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`wikipedia ${title}: HTTP ${res.status}`);
    const json = (await res.json()) as { parse?: { title?: string; text?: string }; error?: { code?: string; info?: string } };
    if (json.error) {
      if (json.error.code === 'missingtitle') return null;
      throw new Error(`wikipedia ${title}: ${json.error.info}`);
    }
    return { title: json.parse?.title ?? title, html: json.parse?.text ?? '' };
  }
  throw new Error(`wikipedia ${title}: rate limited`);
}

/** Infobox rows as flat text ("Rushing yards 1,676"). */
function infoboxRows(html: string): string[] {
  const start = html.indexOf('<table class="infobox');
  if (start < 0) return [];
  const end = html.indexOf('</table>', start);
  const box = html.slice(start, end);
  return [...box.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => m[1].replace(/<br\s*\/?>/g, ' / ').replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function stat(rows: string[], label: string): number | null {
  const row = rows.find((r) => r.toLowerCase().startsWith(label.toLowerCase()));
  if (!row) return null;
  const m = row.slice(label.length).match(/-?[\d,]+/);
  return m ? parseInt(m[0].replace(/,/g, ''), 10) : null;
}

function candidates(first: string, last: string): string[] {
  const base = `${first} ${last}`;
  return [base, `${base} (American football)`, `${base} (quarterback)`, `${base} (football)`];
}

async function bakeOne(p: { firstName: string; lastName: string; draftYear: number; college?: string | null; careerTo?: number | null }): Promise<QbRushingEntry> {
  const college = normalizeName(p.college ?? '');
  let sawFootball = false;
  for (const title of candidates(p.firstName, p.lastName)) {
    const page = await parsePage(title);
    await sleep(SLEEP_MS);
    if (!page) continue;
    const rows = infoboxRows(page.html);
    const passYards = stat(rows, 'Passing yards');
    const passAtt = stat(rows, 'Passing attempts');
    if (passYards == null && passAtt == null) continue; // disambiguation page, or not a football player
    sawFootball = true;
    // The right man: his infobox mentions his draft year or his college.
    const text = rows.join(' | ');
    const verified = text.includes(String(p.draftYear)) || (college.length >= 4 && normalizeName(text).includes(college));
    if (!verified) continue;
    return {
      page: page.title, passYards, rushYards: stat(rows, 'Rushing yards'), rushTds: stat(rows, 'Rushing touchdowns'),
      games: stat(rows, 'Games played'), careerTo: p.careerTo ?? null, status: 'ok',
    };
  }
  return { page: null, passYards: null, rushYards: null, rushTds: null, games: null, careerTo: p.careerTo ?? null, status: sawFootball ? 'unverified' : 'no-page' };
}

async function main(): Promise<void> {
  const out: Record<string, QbRushingEntry> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).entries ?? {} : {};
  const todo: Array<{ key: string; p: ReturnType<typeof PlayerLookupService.byYear>[number] }> = [];
  for (let y = FROM; y <= TO; y++) {
    for (const p of PlayerLookupService.byYear(y)) {
      if (String(p.position).trim() !== 'QB') continue;
      const c = NflverseCareerService.get(p.firstName, p.lastName, y, p.draftPick);
      if (c?.games) continue; // nflverse already has him
      const key = `${y}|${normalizeName(`${p.firstName} ${p.lastName}`)}`;
      if (out[key]) continue;
      todo.push({ key, p });
    }
  }
  console.log(`${Object.keys(out).length} baked, ${todo.length} to fetch (${FROM}-${TO})`);
  const save = () => {
    const entries = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(OUT, JSON.stringify({
      _source: 'Wikipedia infobox career rushing for quarterbacks absent from nflverse draft_picks (pre-1980 drafts, supplemental picks). rushYards null = no rushing row shown. Baked by scripts/bake-qb-rushing.ts.',
      entries,
    }, null, 2) + '\n');
  };
  let n = 0;
  for (const { key, p } of todo) {
    try {
      out[key] = await bakeOne(p);
    } catch (e) {
      console.log(`  ! ${key}: ${(e as Error).message}`);
      continue;
    }
    const e = out[key];
    n++;
    console.log(`${String(n).padStart(4)}/${todo.length} ${key.padEnd(34)} ${e.status.padEnd(12)} pass ${e.passYards ?? '-'} rush ${e.rushYards ?? '-'} ${e.page ?? ''}`);
    save();
  }
  save();
  const counts: Record<string, number> = {};
  for (const e of Object.values(out)) counts[e.status] = (counts[e.status] ?? 0) + 1;
  console.log('done', counts);
}

main().catch((e) => { console.error(e); process.exit(1); });
