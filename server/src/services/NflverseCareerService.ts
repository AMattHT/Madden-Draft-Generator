import path from 'path';
import { CACHE_DIR } from '../config/paths';
import fs from 'fs';
import { LOOKUPS_DIR } from '../config/paths';
import { parseCsvFile, normalizeName } from '../util/csv';

/**
 * Career / bio bits from nflverse draft_picks + players, keyed by name+year.
 * Fills holes in ALL_PLAYER_LOOKUP (blank wAV, height, accolades). Regular
 * draftees have w_av on draft_picks; UDFAs/supplemental (Cris Carter) are not
 * in that table — we keep a small manual overlay for those stars.
 */
export interface CareerBits {
  wav: number | null;
  heightInches: number | null;
  weight: number | null;
  proBowls: number | null;
  allPro1: number | null;
  seasonsStarted: number | null;
  careerTo: number | null;
  careerFrom: number | null; // nflverse rookie_season; the only career signal most UDFAs have
  isHOF: boolean | null;
  age: number | null;
  receptions: number | null;
  recYards: number | null;
  recTds: number | null;
  rushAtts: number | null;
  rushYards: number | null;
  defSacks: number | null;
  defInts: number | null;
  games: number | null;
  draftTeam: string | null; // nflverse team code at the draft (RAM, BAL, NWE ...)
  draftPick: number | null; // overall pick (resolves same-name/same-year collisions)
  birthDate: string | null; // 'YYYY-MM-DD' (nflverse players.csv)
  jersey: number | null; // last known jersey number (nflverse players.csv)
  passYards: number | null;
  headshotUrl: string | null;
}

// Supplemental / UDFA stars nflverse draft_picks omits. Values from PFR.
const MANUAL: Record<string, CareerBits> = {
  criscarter: {
    wav: 99, heightInches: 75, weight: 202, proBowls: 8, allPro1: 2,
    seasonsStarted: 15, careerTo: 2002, careerFrom: 1987, isHOF: true, age: 21,
    receptions: 1101, recYards: 13899, recTds: 130,
    rushAtts: 13, rushYards: 41, defSacks: null, defInts: null, games: 234, draftTeam: 'PHI', draftPick: null, birthDate: '1965-11-25', jersey: 80, passYards: null, headshotUrl: null,
  },
};

interface PickRow {
  season?: string;
  pick?: string;
  pfr_player_name?: string;
  w_av?: string;
  hof?: string;
  allpro?: string;
  probowls?: string;
  seasons_started?: string;
  to?: string;
  age?: string;
  receptions?: string;
  rec_yards?: string;
  rec_tds?: string;
  rush_atts?: string;
  rush_yards?: string;
  def_sacks?: string;
  def_ints?: string;
  games?: string;
  team?: string;
  pass_yards?: string;
}
interface PlayerRow {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  common_first_name?: string;
  football_name?: string;
  draft_year?: string;
  draft_team?: string;
  draft_pick?: string;
  birth_date?: string;
  jersey_number?: string;
  height?: string;
  weight?: string;
  headshot?: string;
  espn_id?: string;
  last_season?: string;
  rookie_season?: string;
}

/** ESPN ids nflverse files on the wrong player, keyed by id — see
 *  scripts/build-espn-headshot-check.ts. Empty if the file was never built. */
let espnBlocked: Set<string> | null = null;
function blockedEspnIds(): Set<string> {
  if (espnBlocked) return espnBlocked;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(LOOKUPS_DIR, 'espn-headshot-blocklist.json'), 'utf8')
    ) as { blocked?: Record<string, unknown> };
    espnBlocked = new Set(Object.keys(raw.blocked ?? {}));
  } catch {
    espnBlocked = new Set();
  }
  return espnBlocked;
}

/**
 * The NFL CDN no longer hosts photos for most players out of the league since
 * ~2019 — their nflverse headshot URLs answer 200 with a generic helmeted-
 * silhouette placeholder (byte-identical for every player), which painted whole
 * historical classes with the same fake "photo". ESPN still serves the real
 * headshot for those ids (and honestly 404s when it has none, which lets the UI
 * fall back to the in-game portrait). Current players keep the NFL photo.
 *
 * That leans on the id being right, and a handful are not: nflverse files
 * espn_id 17343 on the 1984 nose tackle Michael Carter, but ESPN's 17343 is a
 * Michael Carter born in 1991. The URL resolves, so the class showed a real
 * photo of the wrong man. Ids whose ESPN birth year contradicts nflverse's are
 * blocked (scripts/build-espn-headshot-check.ts).
 *
 * A blocked id returns nothing rather than the NFL url: for these players that
 * url is the silhouette placeholder above, so falling back to it would trade a
 * stranger's face for a fake one. With no photo the UI drops to the player's
 * in-game portrait, which is what a player with no picture already gets.
 */
export function preferredHeadshot(espnId: string | undefined, lastSeason: number | null, nflUrl: string | null): string | null {
  const espn = (espnId || '').trim();
  if (/^\d+$/.test(espn) && (lastSeason == null || lastSeason <= 2019)) {
    return blockedEspnIds().has(espn)
      ? null
      : `https://a.espncdn.com/i/headshots/nfl/players/full/${espn}.png`;
  }
  return nflUrl;
}

let byKey: Map<string, CareerBits[]> | null = null;
/** Undrafted players indexed by name + rookie season (see load()). */
let undraftedByName: Map<string, { rookie: number; bits: CareerBits }[]> | null = null;

function num(s: string | undefined): number | null {
  const n = parseInt(String(s ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function keyOf(year: number, name: string): string {
  return `${year}|${normalizeName(name)}`;
}

/** Every name nflverse knows a player by, most formal first.
 *
 *  draft_picks keys on PFR's name, which is the formal one ("Matthew Bosher",
 *  "Michael Person", "Olusegun Oluwatimi"), while players.csv leads with the
 *  casual display_name ("Matt Bosher", "Mike Person", "Olu Oluwatimi"). Keying
 *  only on display_name files the headshot under a name nothing else uses, so
 *  the player the app actually looks up never gets a photo. Multi-word
 *  surnames (Van Noy, Vander Esch, St. Brown, Randle El) hit the same problem
 *  whenever the two sources disagree about the given name.
 */
function nameVariants(r: PlayerRow): string[] {
  const last = (r.last_name || '').trim();
  const firsts = [r.first_name, r.common_first_name, r.football_name]
    .map((f) => (f || '').trim())
    .filter(Boolean);
  const names = [(r.display_name || '').trim(), ...(last ? firsts.map((f) => `${f} ${last}`) : [])];
  const seen = new Set<string>();
  return names.filter((n) => {
    const key = normalizeName(n);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function merge(into: CareerBits, extra: Partial<CareerBits>): CareerBits {
  return {
    wav: extra.wav ?? into.wav,
    heightInches: extra.heightInches ?? into.heightInches,
    weight: extra.weight ?? into.weight,
    proBowls: extra.proBowls ?? into.proBowls,
    allPro1: extra.allPro1 ?? into.allPro1,
    seasonsStarted: extra.seasonsStarted ?? into.seasonsStarted,
    careerTo: extra.careerTo ?? into.careerTo,
    careerFrom: extra.careerFrom ?? into.careerFrom,
    isHOF: extra.isHOF ?? into.isHOF,
    age: extra.age ?? into.age,
    receptions: extra.receptions ?? into.receptions,
    recYards: extra.recYards ?? into.recYards,
    recTds: extra.recTds ?? into.recTds,
    rushAtts: extra.rushAtts ?? into.rushAtts,
    rushYards: extra.rushYards ?? into.rushYards,
    defSacks: extra.defSacks ?? into.defSacks,
    defInts: extra.defInts ?? into.defInts,
    games: extra.games ?? into.games,
    draftTeam: extra.draftTeam ?? into.draftTeam,
    draftPick: extra.draftPick ?? into.draftPick,
    birthDate: extra.birthDate ?? into.birthDate,
    jersey: extra.jersey ?? into.jersey,
    passYards: extra.passYards ?? into.passYards,
    headshotUrl: extra.headshotUrl ?? into.headshotUrl,
  };
}

function empty(): CareerBits {
  return {
    wav: null, heightInches: null, weight: null, proBowls: null,
    allPro1: null, seasonsStarted: null, careerTo: null, careerFrom: null, isHOF: null, age: null,
    receptions: null, recYards: null, recTds: null, rushAtts: null,
    rushYards: null, defSacks: null, defInts: null, games: null, draftTeam: null,
    draftPick: null, birthDate: null, jersey: null, passYards: null, headshotUrl: null,
  };
}

function load(): Map<string, CareerBits[]> {
  if (byKey) return byKey;
  byKey = new Map();
  undraftedByName = new Map();
  const add = (k: string, bits: CareerBits) => {
    const list = byKey!.get(k);
    if (list) list.push(bits);
    else byKey!.set(k, [bits]);
  };
  try {
    const picks = parseCsvFile<PickRow>(path.join(CACHE_DIR, 'nflverse_draft_picks.csv'));
    for (const r of picks) {
      const year = num(r.season);
      const name = (r.pfr_player_name || '').trim();
      if (!year || !name) continue;
      const wav = num(r.w_av);
      add(keyOf(year, name), {
        wav: wav != null ? wav : null,
        heightInches: null,
        weight: null,
        proBowls: num(r.probowls),
        allPro1: num(r.allpro),
        seasonsStarted: num(r.seasons_started),
        careerTo: num(r.to),
        careerFrom: year,
        isHOF: String(r.hof || '').toUpperCase() === 'TRUE',
        age: num(r.age),
        receptions: num(r.receptions),
        recYards: num(r.rec_yards),
        recTds: num(r.rec_tds),
        rushAtts: num(r.rush_atts),
        rushYards: num(r.rush_yards),
        defSacks: r.def_sacks != null && r.def_sacks !== '' ? parseFloat(r.def_sacks) : null,
        defInts: num(r.def_ints),
        games: num(r.games),
        draftTeam: (r.team || '').trim().toUpperCase() || null,
        draftPick: num(r.pick),
        birthDate: null,
        jersey: null,
        passYards: num(r.pass_yards),
        headshotUrl: null,
      });
    }
  } catch { /* optional cache */ }
  try {
    const players = parseCsvFile<PlayerRow>(path.join(CACHE_DIR, 'nflverse_players.csv'));
    for (const r of players) {
      const year = num(r.draft_year);
      const variants = nameVariants(r);
      if (!variants.length) continue;
      const h = num(r.height);
      const w = num(r.weight);
      const hs = (r.headshot || '').trim();
      const dt = (r.draft_team || '').trim().toUpperCase();
      const pk = num(r.draft_pick);
      const bd = (r.birth_date || '').trim();
      const rookie = num(r.rookie_season);
      const last = num(r.last_season);
      const extra: Partial<CareerBits> = {
        draftTeam: dt || null,
        draftPick: pk,
        birthDate: /^\d{4}-\d{2}-\d{2}/.test(bd) ? bd.slice(0, 10) : null,
        jersey: (() => { const j = num(r.jersey_number); return j != null && j >= 0 && j <= 99 ? j : null; })(),
        heightInches: h != null && h >= 60 && h <= 84 ? h : null,
        weight: w != null && w >= 140 && w <= 400 ? w : null,
        headshotUrl: preferredHeadshot(r.espn_id, num(r.last_season), hs.startsWith('http') ? hs : null),
      };
      // Undrafted players carry no draft_year, so the year-keyed index above can
      // never reach them -- 51% of players.csv. Index them by name alongside
      // their rookie season, which is what disambiguates same-name players.
      if (rookie != null) {
        // The span goes ONLY on the undrafted bits. Putting it in `extra` would
        // let nflverse's last_season override draft_picks' `to` for every
        // drafted player, shifting career lengths the ratings are calibrated on.
        const bits = merge(empty(), { ...extra, careerFrom: rookie, careerTo: last });
        for (const n of variants) {
          const k = normalizeName(n);
          const l = undraftedByName!.get(k);
          if (l) l.push({ rookie, bits });
          else undraftedByName!.set(k, [{ rookie, bits }]);
        }
      }
      if (!year) continue;
      const keys = variants.map((n) => keyOf(year, n));
      // Attach to the draft_picks row with the same pick (or the only row); otherwise
      // this is a distinct same-name player -> its own entry. Try every name
      // nflverse knows him by, so a formal/casual mismatch still finds him.
      let list: CareerBits[] | undefined;
      let target: CareerBits | undefined;
      for (const key of keys) {
        const candidates = byKey.get(key);
        if (!candidates) continue;
        const hit = candidates.length === 1 && (pk == null || candidates[0].draftPick == null || candidates[0].draftPick === pk)
          ? candidates[0]
          : candidates.find((b) => pk != null && b.draftPick === pk);
        if (hit) { list = candidates; target = hit; break; }
      }
      if (target) {
        const merged = merge(target, { ...extra, draftTeam: target.draftTeam ?? extra.draftTeam ?? null });
        list![list!.indexOf(target)] = merged;
      } else {
        // No draft_picks row under any name -- file him under all of them so a
        // lookup by either the formal or the casual name resolves.
        const merged = merge(empty(), extra);
        for (const key of keys) add(key, merged);
      }
    }
  } catch { /* optional cache */ }
  return byKey;
}

/** Curated careers for undrafted / supplemental stars (data/lookups/udfa_careers.json),
 *  keyed "<year>|<normalized name>". */
let udfa: Map<string, Partial<CareerBits>> | null = null;
function loadUdfa(): Map<string, Partial<CareerBits>> {
  if (udfa) return udfa;
  udfa = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'udfa_careers.json'), 'utf8')) as { players: Record<string, Partial<CareerBits>> };
    for (const [k, v] of Object.entries(raw.players || {})) {
      const [year, name] = k.split('|');
      udfa.set(`${parseInt(year, 10)}|${normalizeName(name)}`, v);
    }
  } catch { /* optional */ }
  return udfa;
}

export const NflverseCareerService = {
  /** Career bits for a player. `pick` (overall) disambiguates two players with the
   *  same name in the same draft (1993 had two Chad Browns); without it the more
   *  notable career (higher wAV) wins. */
  get(first: string, last: string, year: number, pick?: number | null): CareerBits | null {
    const map = load();
    const nk = normalizeName(`${first} ${last}`);
    const list = map.get(`${year}|${nk}`);
    let hit: CareerBits | undefined;
    if (list && list.length) {
      hit = pick != null ? list.find((b) => b.draftPick === pick) : undefined;
      // `pick === null` means undrafted: draft_picks never holds him, so a same-name
      // draftee's row (2013: TE Ryan Griffin, pick 201, for the UDFA quarterback)
      // is another man. `undefined` = pick unknown: keep the most notable match.
      if (!hit && pick !== null) hit = [...list].sort((a, b) => (b.wav ?? -1) - (a.wav ?? -1))[0];
      if (!hit && pick === null) hit = list.find((b) => b.draftPick == null);
    }
    const manual = MANUAL[nk] ?? loadUdfa().get(`${year}|${nk}`);
    if (hit && manual) return merge(hit, manual);
    if (manual) return merge(empty(), manual);
    return hit ?? null;
  },

  /**
   * Career span for an UNDRAFTED player, from nflverse players.csv.
   *
   * ALL_PLAYER_LOOKUP carries 4,201 undrafted rows and almost nothing about
   * them: 0% have seasons-started, 0% a wAV, 0.1% an All-Pro, 0.1% even a
   * career end. With no career signal at all the wAV estimator falls back to
   * the draft-slot expectation and rates every one of them ~2, including men
   * who started for a decade.
   *
   * nflverse knows 3,479 of them, and has rookie_season/last_season for 100%
   * of those -- but no draft_year, so the year-keyed index above can never
   * reach them. Match on name plus rookie season instead: an undrafted player
   * signs the year he would have been drafted, so his rookie season sits within
   * a year of the lookup's draft class. That tolerance is what makes this safe
   * -- 426 name matches are a different man from another era (deltas up to 47
   * seasons) and are correctly refused. 3,079 match cleanly; 1,633 of them had
   * careers of five seasons or more.
   */
  getUndrafted(first: string, last: string, draftYear: number, tolerance = 1): CareerBits | null {
    load();
    const list = undraftedByName?.get(normalizeName(`${first} ${last}`));
    if (!list || !list.length) return null;
    const near = list
      .filter((c) => Math.abs(c.rookie - draftYear) <= tolerance)
      .sort((a, b) => Math.abs(a.rookie - draftYear) - Math.abs(b.rookie - draftYear));
    return near.length ? near[0].bits : null;
  },

  /** True when more than one player of this name was drafted (or signed) in
   *  `year` and `pick` cannot tell them apart — a lookup then returns the more
   *  notable one, which is the wrong man half the time (2013: Ryan Griffin the
   *  tight end vs Ryan Griffin the quarterback, both undrafted). */
  ambiguous(first: string, last: string, year: number, pick?: number | null): boolean {
    const list = load().get(`${year}|${normalizeName(`${first} ${last}`)}`);
    if (!list || !list.length) return false;
    if (pick === null) return list.some((b) => b.draftPick != null); // undrafted vs a drafted namesake
    if (list.length < 2) return false;
    return pick == null || !list.some((b) => b.draftPick === pick);
  },
};
