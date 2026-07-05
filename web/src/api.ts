import type { GeneratedClass, ClassEdits, GearEdits, GearOption } from './types';

/** Backend-proxied image URL (avoids hotlink/CORS blocks on Wikipedia/PFR). */
export const imageUrl = (url: string) => `/api/image?url=${encodeURIComponent(url)}`;

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface ArchetypeOption {
  id: number;
  name: string;
}

export interface PlayerSearchResult {
  firstName: string;
  lastName: string;
  draftYear: number;
  draftRound: number | null;
  draftPick: number | null;
  position: string;
  college: string;
  league: string;
}

export interface FranchiseInfo {
  name: string;
  sizeBytes: number;
  modified: number;
}

export interface CapResetOptions {
  clearDeadMoney: boolean;
  capRoomMode: 'off' | 'freed' | 'fixed';
  fixedCapRoomM?: number;
  rolloverFloorM?: number;
  salaryScale?: number | null;
}

interface CapState {
  deadMoneyM: number;
  nextDeadMoneyM: number;
  capRoomM: number;
  rolloverM: number;
}

export interface CapResetResult {
  input: string;
  output: string;
  teamsEdited: number;
  playersScaled: number;
  teams: { name: string; salaryM: number; before: CapState; after: CapState }[];
}

export interface PlayerEditOptions {
  healInjuries: boolean;
  setDev: { scope: 'all' | 'rookies'; tier: 'Normal' | 'Star' | 'Superstar' | 'XFactor' } | null;
}

export interface PlayerEditResult {
  input: string;
  output: string;
  playersConsidered: number;
  injuriesCleared: number;
  devSet: number;
}

export interface FranchisePlayer {
  id: number;
  firstName: string;
  lastName: string;
  position: string;
  teamIndex: number;
  team: string;
  overall: number;
  age: number;
  yearsPro: number;
  dev: string;
  jersey: number;
  status: string;
  ratings: Record<string, number>;
}

export interface FranchisePlayersResult {
  teams: { index: number; name: string }[];
  players: FranchisePlayer[];
}

export interface PlayerFieldEdit {
  overall?: number;
  age?: number;
  position?: string;
  dev?: string;
  jersey?: number;
  ratings?: Record<string, number>;
}

export interface RgbColor { r: number; g: number; b: number; }

export interface TeamIdentity {
  teamIndex: number;
  displayName: string;
  nickName: string;
  city: string;
  abbreviation: string;
  prefix: string;
  logoId: number;
  hasSecondaryColor: boolean;
  primary: RgbColor;
  secondary: RgbColor;
  hub: RgbColor;
  locked: boolean;
}

export interface RelocateRebrandOptions {
  teamIndex: number;
  displayName?: string;
  nickName?: string;
  city?: string;
  abbreviation?: string;
  prefix?: string;
  primary?: RgbColor;
  secondary?: RgbColor;
  hub?: RgbColor;
  logoId?: number;
  setRelocatedFlag?: boolean;
}

export interface FieldChange { field: string; before: string | number; after: string | number; }

export interface RelocateRebrandResult {
  input: string;
  output: string;
  teamIndex: number;
  mode: 'REBRAND' | 'RELOCATE';
  teamName: string;
  wasLocked: boolean;
  changes: FieldChange[];
  skippedFields: string[];
}

export interface TraitRealismOptions {
  includeUnsigned?: boolean;
  xfactorCap?: number;
  superstarCap?: number;
  dryRun?: boolean;
}
export interface TraitTierCounts { Normal: number; Star: number; Superstar: number; XFactor: number; }
export interface TraitUpgrade {
  name: string; position: string; team: string; overall: number; age: number; from: string; to: string;
}
export interface TraitRealismResult {
  input: string; output: string; dryRun: boolean;
  playersConsidered: number; changed: number;
  before: TraitTierCounts; after: TraitTierCounts;
  byPosition: Record<string, TraitTierCounts>;
  notable: TraitUpgrade[];
}

export interface FaTrimOptions {
  ovrThreshold?: number;
  ageThreshold?: number;
  targetN?: number;
  dryRun?: boolean;
}
export interface FaTrimVictim { name: string; position: string; overall: number; age: number; }
export interface FaTrimResult {
  input: string; output: string; dryRun: boolean;
  freeAgentsBefore: number; trimmed: number; freeAgentsAfter: number;
  maxFreeAgents: number; victims: FaTrimVictim[];
}

export interface DraftPickResetOptions { dryRun?: boolean; }
export interface DraftPickRestore {
  round: number; pickNumber: number; yearOffset: number; fromTeam: string; toTeam: string;
}
export interface DraftPickResetResult {
  input: string; output: string; dryRun: boolean;
  poolRows: number; traded: number; restored: number; restores: DraftPickRestore[];
}

export interface ScheduleGame {
  away: string; home: string; played: boolean;
  awayScore: number; homeScore: number; status: string;
  day: string; time: string; timeMinutes: number; gameId: number;
}
export interface ScheduleWeek { stage: string; seasonWeek: number; label: string; games: ScheduleGame[]; }
export interface FranchiseScheduleResult {
  input: string; seasonYear: number; currentStage: string; currentWeek: number; weeks: ScheduleWeek[];
}

export const api = {
  years: () => jget<{ years: number[] }>('/api/draft/years').then((r) => r.years),

  archetypesByPosition: () =>
    jget<Record<string, ArchetypeOption[]>>('/api/lookups/archetypes-by-position'),

  equipmentOptions: (year: number) =>
    jget<Record<string, GearOption[]>>(`/api/lookups/equipment?year=${year}`),

  /** A Madden id/name lookup table (e.g. "college", "state") for editor dropdowns. */
  lookup: (name: string) => jget<{ id: number; name: string }[]>(`/api/lookups/${name}`),

  /** Generic draft-class head codes grouped by skin tone (1-8), for the face picker. */
  genericHeads: () => jget<Record<string, string[]>>('/api/lookups/generic-heads'),

  playerSearch: (query: string, limit = 40) =>
    jget<{ results: PlayerSearchResult[] }>(
      `/api/players/search?q=${encodeURIComponent(query)}&limit=${limit}`
    ).then((r) => r.results),

  generated: (year: number, league: string, mode: string) =>
    jget<GeneratedClass>(`/api/draft/${year}/generated?league=${league}&mode=${mode}`),

  /** Custom class: All-Time Greats / by-decade source and/or generation modifiers. */
  generatedCustom: (opts: {
    source: 'year' | 'alltime' | 'decade';
    year?: number;
    decade?: number;
    league?: string;
    mode: string;
    strength?: number;
    studs?: number;
    generational?: boolean;
  }) =>
    fetch('/api/draft/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    }).then(async (res) => {
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return res.json() as Promise<GeneratedClass>;
    }),

  /** Build the .mdc on the server (with any edits) and trigger a browser download. */
  async downloadMdc(
    year: number,
    league: string,
    edits?: ClassEdits,
    mode?: string,
    gearEdits?: GearEdits,
    draftOpts?: { source: 'year' | 'alltime' | 'decade'; decade?: number; strength: number; studs: number; generational: boolean }
  ) {
    const res = await fetch('/api/export/mdc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, league, edits, mode, gearEdits, ...draftOpts }),
    });
    if (!res.ok) throw new Error(`export failed: HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Match Madden's own save naming (extensionless CAREERDRAFT-*) so the file
    // drops straight into the Saves folder and shows up in "Load Draft Class".
    a.download =
      draftOpts?.source === 'alltime' ? 'CAREERDRAFT-ALLTIMEGREATS'
      : draftOpts?.source === 'decade' ? `CAREERDRAFT-${draftOpts.decade}sGREATS`
      : `CAREERDRAFT-${year}DRAFT`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return {
      count: res.headers.get('X-Prospect-Count'),
      asset: res.headers.get('X-Likeness-Asset'),
      custom: res.headers.get('X-Likeness-CustomPortrait'),
    };
  },

  buildPortraits: (year: number, league: string, limit?: number) =>
    fetch(`/api/export/portraits/${year}?league=${league}${limit ? `&limit=${limit}` : ''}`, {
      method: 'POST',
    }).then((r) => r.json()),

  /** CAREER franchise saves found in the local Madden Saves directory. */
  franchiseList: () => jget<{ savesDir: string; franchises: FranchiseInfo[] }>('/api/franchise/list'),

  /** Apply a salary-cap reset; writes a new CAREER-*-CAPRESET save (input untouched). */
  async franchiseCapReset(fileName: string, options: CapResetOptions): Promise<CapResetResult> {
    const res = await fetch('/api/franchise/cap-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, options }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Bulk player edits (heal injuries, set dev traits); writes a new CAREER-*-PLAYERS save. */
  async franchisePlayerEdit(fileName: string, options: PlayerEditOptions): Promise<PlayerEditResult> {
    const res = await fetch('/api/franchise/player-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, options }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Load all editable players from a franchise save (roster editor). */
  async franchisePlayers(fileName: string): Promise<FranchisePlayersResult> {
    const res = await fetch('/api/franchise/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Apply per-player roster edits; writes a new CAREER-*-ROSTER save. */
  async franchiseRosterApply(fileName: string, edits: Record<number, PlayerFieldEdit>): Promise<{ output: string; playersEdited: number }> {
    const res = await fetch('/api/franchise/roster-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, edits }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Read each team's current identity (name/city/abbr/colors/logo) for the rebrand tool. */
  async franchiseTeams(fileName: string): Promise<{ input: string; teams: TeamIdentity[] }> {
    const res = await fetch('/api/franchise/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Relocate/rebrand a team; writes a new CAREER-*-RELOCATE / -REBRAND save. */
  async franchiseRelocateRebrand(fileName: string, options: RelocateRebrandOptions): Promise<RelocateRebrandResult> {
    const res = await fetch('/api/franchise/relocate-rebrand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, options }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Realistic dev-trait pass. dryRun:true previews counts; else writes a new CAREER-*-TRAITS save. */
  async franchiseTraitRealism(fileName: string, options: TraitRealismOptions): Promise<TraitRealismResult> {
    const res = await fetch('/api/franchise/trait-realism', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, options }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Trim the FA pool by OVR/age. dryRun:true previews; else writes a new CAREER-*-FATRIM save. */
  async franchiseTrimFreeAgents(fileName: string, options: FaTrimOptions): Promise<FaTrimResult> {
    const res = await fetch('/api/franchise/trim-free-agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, options }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Un-trade future draft picks. dryRun:true previews; else writes a new CAREER-*-DRAFTPICKS save. */
  async franchiseResetDraftPicks(fileName: string, options: DraftPickResetOptions): Promise<DraftPickResetResult> {
    const res = await fetch('/api/franchise/reset-draft-picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, options }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /** Read the full season schedule grouped by week (read-only). */
  async franchiseSchedule(fileName: string): Promise<FranchiseScheduleResult> {
    const res = await fetch('/api/franchise/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
};
