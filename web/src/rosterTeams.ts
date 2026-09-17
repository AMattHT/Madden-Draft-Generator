import type { RosterTeam, TeamFranchise, TeamInfo } from './types';

/**
 * Logos for a roster's teams from the app's franchise list. A roster team matches a
 * franchise by nickname (Bears ↔ Chicago Bears), else by city (the roster's Washington
 * Redskins against the franchise list's Washington Commanders). Free agency and anything
 * unmatched are left out, so callers fall back to text.
 */
export function teamInfoMap(teams: RosterTeam[], franchises: TeamFranchise[]): Map<number, TeamInfo> {
  const out = new Map<number, TeamInfo>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const t of teams) {
    if (!t.name || /free/i.test(t.name)) continue;
    const nick = norm(t.name);
    const city = norm(t.city);
    const hit = franchises.find((f) => norm(f.name).endsWith(nick))
      ?? (city ? franchises.find((f) => norm(f.name).startsWith(city)) : undefined);
    if (hit) out.set(t.id, { abbr: t.abbr, name: `${t.city} ${t.name}`.trim(), logo: hit.logo });
  }
  return out;
}
