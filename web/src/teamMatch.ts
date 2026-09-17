import type { RosterData, TeamInfo } from './types';

/** A team the picker can choose: a roster team id with its display names. */
export interface PickTeam {
  id: number;
  abbr: string;
  /** "Seattle Seahawks", or "Free agents". */
  name: string;
  logo?: TeamInfo;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Teams matching what the user typed: every typed word must start some word of the
 * team's abbreviation or name, in order ("san fran" is the 49ers, "ny" both New York
 * clubs, "kc" the Chiefs by abbreviation). Empty input lists every team.
 */
export function matchTeams(teams: PickTeam[], query: string, limit = 8): PickTeam[] {
  const q = norm(query);
  if (!q) return teams.slice(0, limit);
  const words = q.split(' ');
  const hits = teams.filter((t) => {
    const parts = norm(`${t.abbr} ${t.name}`).split(' ');
    let from = 0;
    for (const w of words) {
      const at = parts.findIndex((p, i) => i >= from && p.startsWith(w));
      if (at < 0) return false;
      from = at + 1;
    }
    return true;
  });
  // A whole-abbreviation hit outranks a name hit ("sea" before "Seattle" only matters for ordering).
  hits.sort((a, b) => Number(norm(b.abbr) === q) - Number(norm(a.abbr) === q) || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}

/** A roster's teams as pickable entries, alphabetical by abbreviation, free agents last. */
export function pickTeams(data: Pick<RosterData, 'teams' | 'freeAgentTeamId'>, logos?: Map<number, TeamInfo>): PickTeam[] {
  const fa = data.freeAgentTeamId;
  const clubs = data.teams.filter((t) => t.id !== fa).sort((a, b) => a.abbr.localeCompare(b.abbr))
    .map((t) => ({ id: t.id, abbr: t.abbr, name: `${t.city} ${t.name}`.trim(), logo: logos?.get(t.id) }));
  return [...clubs, { id: fa, abbr: 'FA', name: 'Free agents' }];
}
