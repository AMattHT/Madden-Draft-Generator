/**
 * Verify the ESPN athlete id nflverse carries for each player, and bake the
 * ones that belong to somebody else.
 *
 * preferredHeadshot() builds an ESPN headshot URL for any player whose last
 * season is 2019 or earlier, because the NFL's own CDN answers those with a
 * byte-identical silhouette. That was right, but it assumed the id itself is
 * trustworthy -- that ESPN either has the player's photo or honestly 404s.
 *
 * It does neither when the id is simply wrong. nflverse files espn_id 17343 on
 * Michael Carter, the 1984 SMU nose tackle (6'2", 281 lb, born 1960). ESPN's
 * 17343 is a different Michael Carter: born 1991, debut 2014, 5'11", 189 lb.
 * The URL resolves, so the 1984 draft class showed a real photograph of a man
 * who was born after that player retired -- the failure mode looks exactly
 * like success.
 *
 * A duplicate-id check does not find these: the bad id appears on one row only.
 * What does find them is the birth year, which nflverse and ESPN both carry
 * independently. Disagreement means the id points at a different person.
 *
 * These are rare -- 199 of a random 200 agreed -- so this bakes a blocklist of
 * the exceptions rather than a verified allowlist.
 *
 * Writes data/lookups/espn-headshot-blocklist.json.
 *
 *   npx tsx scripts/build-espn-headshot-check.ts [--limit N]
 */
import fs from 'fs';
import path from 'path';
import { CACHE_DIR, LOOKUPS_DIR } from '../src/config/paths';
import { parseCsvFile } from '../src/util/csv';

interface Row {
  display_name?: string;
  espn_id?: string;
  last_season?: string;
  birth_date?: string;
}

const OUT = path.join(LOOKUPS_DIR, 'espn-headshot-blocklist.json');
const ATHLETE = (id: string) =>
  `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${id}`;

const num = (s: string | undefined): number | null => {
  const n = parseInt(String(s ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
};

/** ESPN's record for an id, or null when it has none / the fetch failed. */
async function espnBirthYear(id: string): Promise<{ year: number | null; name: string } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ATHLETE(id), {
        headers: { 'User-Agent': 'MaddenDraftClassGenerator/1.0 (personal modding tool)' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { dateOfBirth?: string; fullName?: string };
      const y = num((d.dateOfBirth ?? '').slice(0, 4));
      return { year: y, name: d.fullName ?? '' };
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

/** Run `work` over `items` with at most `n` in flight. */
async function pool<T, R>(items: T[], n: number, work: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await work(items[i]);
      }
    })
  );
  return out;
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const rows = parseCsvFile<Row>(path.join(CACHE_DIR, 'nflverse_players.csv'));
  // Only ids the app would actually turn into a headshot URL, and only rows
  // carrying the birth year the check needs.
  const candidates = rows
    .map((r) => ({
      name: r.display_name ?? '',
      id: String(r.espn_id ?? '').trim(),
      last: num(r.last_season),
      birth: num((r.birth_date ?? '').slice(0, 4)),
    }))
    .filter((c) => /^\d+$/.test(c.id) && c.last != null && c.last <= 2019 && c.birth != null)
    .slice(0, limit === Infinity ? undefined : limit);

  console.log(`checking ${candidates.length} ESPN ids…`);
  let done = 0;
  const results = await pool(candidates, 8, async (c) => {
    const espn = await espnBirthYear(c.id);
    if (++done % 500 === 0) console.log(`  ${done}/${candidates.length}`);
    return { c, espn };
  });

  const blocked: Record<string, { player: string; espnName: string; nflverseBirth: number; espnBirth: number }> = {};
  let agreed = 0;
  let unknown = 0;
  for (const { c, espn } of results) {
    if (!espn || espn.year == null) { unknown++; continue; }
    if (Math.abs(espn.year - (c.birth as number)) <= 1) { agreed++; continue; }
    blocked[c.id] = {
      player: c.name,
      espnName: espn.name,
      nflverseBirth: c.birth as number,
      espnBirth: espn.year,
    };
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        _source: 'ESPN core API dateOfBirth vs nflverse players.csv birth_date',
        _checked: candidates.length,
        _agreed: agreed,
        _unverifiable: unknown,
        blocked,
      },
      null,
      1
    )
  );
  console.log(`\nagreed ${agreed} | unverifiable ${unknown} | WRONG PERSON ${Object.keys(blocked).length}`);
  for (const [id, b] of Object.entries(blocked)) {
    console.log(`  ${id}  ${b.player} (${b.nflverseBirth}) -> ESPN ${b.espnName} (${b.espnBirth})`);
  }
  console.log(`\nwrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
