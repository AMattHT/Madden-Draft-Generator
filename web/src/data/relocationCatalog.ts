/**
 * Madden 26 relocation catalog — extracted from the game files
 * (E:/…/Madden NFL 26/Data/Win32/superbundlelayout/*.cas).
 *
 * Names + destination cities + city→abbreviation codes are AUTHORITATIVE, read from
 * the uncompressed EBX string tables (TeamHelmets/…, UniformVisuals/Expansion/…, and
 * the teamdb_ TeamIdentity 512-byte catalog in football_installpackage_globals/cas_06).
 *
 * Colors are NOT authoritative: the schema confirms each relocation name stores byte-RGB
 * primary/secondary (TEAM_BACKGROUNDCOLOR R/G/B + R2/G2/B2 — the same fields we write),
 * but the values are bit-packed EBX payloads that can't be aligned to a name without a
 * full EBX descriptor parse. The `primary`/`secondary` hexes below are best-guess DEFAULTS
 * derived from each team's uniform color *family* (blu/red/gol/…). They pre-fill the
 * editable color pickers as a starting point — treat them as approximate, not exact.
 */

export interface RelocationName {
  name: string;       // display nickname
  city?: string;      // Madden's default destination city for this name (where known)
  primary?: string;   // approximate default primary color (hex) — editable
  secondary?: string; // approximate default secondary color (hex) — editable
}

export interface RelocationCity {
  name: string;
  code: string; // 3-letter abbreviation Madden uses for a team relocated here
}

export const RELOCATION_CITIES: RelocationCity[] = [
  { name: 'Austin', code: 'AUS' },
  { name: 'Brooklyn', code: 'BKN' },
  { name: 'Chicago', code: 'CHO' },
  { name: 'Columbus', code: 'CLS' },
  { name: 'Dublin', code: 'DUB' },
  { name: 'Houston', code: 'HOU' },
  { name: 'London', code: 'LDN' },
  { name: 'Los Angeles', code: 'LOS' },
  { name: 'Memphis', code: 'MEM' },
  { name: 'Mexico City', code: 'MEX' },
  { name: 'Oklahoma City', code: 'OKC' },
  { name: 'Orlando', code: 'ORL' },
  { name: 'Portland', code: 'PDX' },
  { name: 'Sacramento', code: 'SAC' },
  { name: 'Salt Lake City', code: 'SLC' },
  { name: 'San Antonio', code: 'SAT' },
  { name: 'Toronto', code: 'TOR' },
];

/** Buildable relocation stadium templates (Madden uses generic templates, not named venues). */
export const RELOCATION_STADIUMS: string[] = [
  'Basic Traditional Stadium',
  'Basic Hybrid Stadium',
  'Deluxe Hybrid Stadium',
  'Deluxe Sphere Stadium',
  'Deluxe Canopy Stadium',
];

/** Whether the per-name colors are exact game values (they are approximate — see header). */
export const RELOCATION_COLORS_EXACT = false;

export const RELOCATION_NAMES: RelocationName[] = [
  { name: 'Aftershocks' },
  { name: 'Antlers', city: 'Dublin', primary: '#1E5631', secondary: '#5B3A21' },
  { name: 'Armadillos', city: 'Austin', primary: '#111111', secondary: '#C9A24B' },
  { name: 'Aviators', city: 'Columbus', primary: '#0000CD', secondary: '#111111' },
  { name: 'Barons' },
  { name: 'Bats' },
  { name: 'Beats' },
  { name: 'Bisons', city: 'Oklahoma City', primary: '#B85C1E', secondary: '#FFFFFF' },
  { name: 'Black Knights', city: 'London', primary: '#111111', secondary: '#B01E28' },
  { name: 'Blues', city: 'Chicago', primary: '#12326B', secondary: '#111111' },
  { name: 'Bulldogs' },
  { name: 'Bulls', city: 'Brooklyn', primary: '#B01E28', secondary: '#111111' },
  { name: 'Capitals', city: 'Columbus', primary: '#B01E28', secondary: '#12326B' },
  { name: 'Celtic Tigers' },
  { name: 'Chasers' },
  { name: 'Condors', city: 'Sacramento', primary: '#5B2A83', secondary: '#FFFFFF' },
  { name: 'Cougars' },
  { name: 'Crusaders' },
  { name: 'Derbys' },
  { name: 'Desperados', city: 'Austin', primary: '#8A8D8F', secondary: '#111111' },
  { name: 'Diablos' },
  { name: 'Dragons', city: 'Los Angeles', primary: '#B01E28', secondary: '#111111' },
  { name: 'Dreadnoughts', city: 'San Antonio', primary: '#12326B', secondary: '#E6C200' },
  { name: 'Egyptians' },
  { name: 'Elites' },
  { name: 'Elks', city: 'Salt Lake City', primary: '#12326B', secondary: '#E6C200' },
  { name: 'Explorers' },
  { name: 'Express' },
  { name: 'Flyers' },
  { name: 'Golden Eagles', city: 'Mexico City', primary: '#1E5631', secondary: '#FFFFFF' },
  { name: 'Gunners' },
  { name: 'Hounds' },
  { name: 'Huskies', city: 'Toronto', primary: '#12326B', secondary: '#FFFFFF' },
  { name: 'Lancers' },
  { name: 'Lumberjacks', city: 'Portland', primary: '#B01E28', secondary: '#5B3A21' },
  { name: 'Marshals' },
  { name: 'Miners' },
  { name: 'Monarchs', city: 'London', primary: '#12326B', secondary: '#B01E28' },
  { name: 'Mounties', city: 'Toronto', primary: '#12326B', secondary: '#B01E28' },
  { name: 'Nighthawks', city: 'Oklahoma City', primary: '#5B2A83', secondary: '#111111' },
  { name: 'Oilers', city: 'Houston', primary: '#12326B', secondary: '#B01E28' },
  { name: 'Orbits', city: 'Orlando', primary: '#12326B', secondary: '#8A8D8F' },
  { name: 'Pioneers', city: 'Salt Lake City', primary: '#B85C1E', secondary: '#5B3A21' },
  { name: 'Redwoods', city: 'Sacramento', primary: '#B85C1E', secondary: '#1D3F8F' },
  { name: 'Riverhogs', city: 'Portland', primary: '#12326B', secondary: '#8A8D8F' },
  { name: 'Sentinels', city: 'Orlando', primary: '#111111', secondary: '#FFFFFF' },
  { name: 'Shamrocks', city: 'Dublin', primary: '#1E5631', secondary: '#FFFFFF' },
  { name: 'Snowhawks', city: 'Portland', primary: '#111111', secondary: '#12326B' },
  { name: 'Steamers', city: 'Memphis', primary: '#008080', secondary: '#111111' },
  { name: 'Thunderbirds', city: 'Toronto', primary: '#B85C1E', secondary: '#B01E28' },
  { name: 'Tigers', city: 'Chicago', primary: '#B85C1E', secondary: '#111111' },
  { name: 'Voyagers', city: 'Houston', primary: '#12326B', secondary: '#C9A24B' },
  { name: 'Wizards', city: 'Orlando', primary: '#5B2A83', secondary: '#C9A24B' },
];
