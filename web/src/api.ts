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

export const api = {
  years: () => jget<{ years: number[] }>('/api/draft/years').then((r) => r.years),

  archetypesByPosition: () =>
    jget<Record<string, ArchetypeOption[]>>('/api/lookups/archetypes-by-position'),

  equipmentOptions: (year: number) =>
    jget<Record<string, GearOption[]>>(`/api/lookups/equipment?year=${year}`),

  /** A Madden id/name lookup table (e.g. "college", "state") for editor dropdowns. */
  lookup: (name: string) => jget<{ id: number; name: string }[]>(`/api/lookups/${name}`),

  playerSearch: (query: string, limit = 40) =>
    jget<{ results: PlayerSearchResult[] }>(
      `/api/players/search?q=${encodeURIComponent(query)}&limit=${limit}`
    ).then((r) => r.results),

  generated: (year: number, league: string, mode: string) =>
    jget<GeneratedClass>(`/api/draft/${year}/generated?league=${league}&mode=${mode}`),

  /** Build the .mdc on the server (with any edits) and trigger a browser download. */
  async downloadMdc(year: number, league: string, edits?: ClassEdits, mode?: string, gearEdits?: GearEdits) {
    const res = await fetch('/api/export/mdc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, league, edits, mode, gearEdits }),
    });
    if (!res.ok) throw new Error(`export failed: HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Match Madden's own save naming (extensionless CAREERDRAFT-*) so the file
    // drops straight into the Saves folder and shows up in "Load Draft Class".
    a.download = `CAREERDRAFT-${year}DRAFT`;
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
};
