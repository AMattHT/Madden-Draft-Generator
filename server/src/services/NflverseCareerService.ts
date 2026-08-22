import path from 'path';
import { CACHE_DIR } from '../config/paths';
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
  passYards: number | null;
  headshotUrl: string | null;
}

// Supplemental / UDFA stars nflverse draft_picks omits. Values from PFR.
const MANUAL: Record<string, CareerBits> = {
  criscarter: {
    wav: 99, heightInches: 75, weight: 202, proBowls: 8, allPro1: 2,
    seasonsStarted: 15, careerTo: 2002, isHOF: true, age: 21,
    receptions: 1101, recYards: 13899, recTds: 130,
    rushAtts: 13, rushYards: 41, defSacks: null, defInts: null, games: 234, draftTeam: 'PHI', draftPick: null, birthDate: '1965-11-25', passYards: null, headshotUrl: null,
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
  draft_year?: string;
  draft_team?: string;
  draft_pick?: string;
  birth_date?: string;
  height?: string;
  weight?: string;
  headshot?: string;
}

let byKey: Map<string, CareerBits[]> | null = null;

function num(s: string | undefined): number | null {
  const n = parseInt(String(s ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function keyOf(year: number, name: string): string {
  return `${year}|${normalizeName(name)}`;
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
    passYards: extra.passYards ?? into.passYards,
    headshotUrl: extra.headshotUrl ?? into.headshotUrl,
  };
}

function empty(): CareerBits {
  return {
    wav: null, heightInches: null, weight: null, proBowls: null,
    allPro1: null, seasonsStarted: null, careerTo: null, isHOF: null, age: null,
    receptions: null, recYards: null, recTds: null, rushAtts: null,
    rushYards: null, defSacks: null, defInts: null, games: null, draftTeam: null,
    draftPick: null, birthDate: null, passYards: null, headshotUrl: null,
  };
}

function load(): Map<string, CareerBits[]> {
  if (byKey) return byKey;
  byKey = new Map();
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
        passYards: num(r.pass_yards),
        headshotUrl: null,
      });
    }
  } catch { /* optional cache */ }
  try {
    const players = parseCsvFile<PlayerRow>(path.join(CACHE_DIR, 'nflverse_players.csv'));
    for (const r of players) {
      const year = num(r.draft_year);
      const name = (r.display_name || `${r.first_name || ''} ${r.last_name || ''}`).trim();
      if (!year || !name) continue;
      const k = keyOf(year, name);
      const h = num(r.height);
      const w = num(r.weight);
      const hs = (r.headshot || '').trim();
      const dt = (r.draft_team || '').trim().toUpperCase();
      const pk = num(r.draft_pick);
      const bd = (r.birth_date || '').trim();
      const extra: Partial<CareerBits> = {
        draftTeam: dt || null,
        draftPick: pk,
        birthDate: /^\d{4}-\d{2}-\d{2}/.test(bd) ? bd.slice(0, 10) : null,
        heightInches: h != null && h >= 60 && h <= 84 ? h : null,
        weight: w != null && w >= 140 && w <= 400 ? w : null,
        headshotUrl: hs.startsWith('http') ? hs : null,
      };
      // Attach to the draft_picks row with the same pick (or the only row); otherwise
      // this is a distinct same-name player -> its own entry.
      const list = byKey.get(k);
      const target = list ? (list.length === 1 && (pk == null || list[0].draftPick == null || list[0].draftPick === pk) ? list[0] : list.find((b) => pk != null && b.draftPick === pk)) : undefined;
      if (target) {
        const merged = merge(target, { ...extra, draftTeam: target.draftTeam ?? extra.draftTeam ?? null });
        list![list!.indexOf(target)] = merged;
      } else {
        add(k, merge(empty(), extra));
      }
    }
  } catch { /* optional cache */ }
  return byKey;
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
      if (!hit) hit = [...list].sort((a, b) => (b.wav ?? -1) - (a.wav ?? -1))[0];
    }
    const manual = MANUAL[nk];
    if (hit && manual) return merge(hit, manual);
    return hit ?? manual ?? null;
  },
};
