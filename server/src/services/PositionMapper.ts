/**
 * Map source position labels (PFR / ALL_PLAYER_LOOKUP) to Madden 26 position
 * ids (0-21, see position_lookup.csv) and to coarse groups used for rating.
 * M26: 0 QB,1 HB,2 FB,3 WR,4 TE,5 LT,6 LG,7 C,8 RG,9 RT,10 LEDG,11 REDG,12 DT,
 *      13 SAM,14 Mike,15 WILL,16 CB,17 FS,18 SS,19 K,20 P,21 LS.
 *
 * Note: the source data uses ~50 labels (HB, LE, RE, MLB, LOLB, ROLB, NT, SE,
 * multi-position like "CB/S", …). The big trap is LE/RE (defensive ends / edge)
 * — if unmapped they default to WR. Edge labels (DE/LE/RE/E/EDGE) → LEDG/REDG.
 */

const M26: Record<string, number> = {
  QB: 0,
  // backs
  HB: 1, RB: 1, TB: 1, B: 1, HALFBACK: 1, TAILBACK: 1,
  FB: 2, FULLBACK: 2,
  // receivers
  WR: 3, SE: 3, FL: 3, WO: 3, SPLITEND: 3, FLANKER: 3, WIDEOUT: 3,
  TE: 4, TIGHTEND: 4,
  // offensive line
  LT: 5, OT: 5, T: 5, OL: 5, OLT: 5,
  LG: 6, G: 6, OG: 6, MG: 6, OLG: 6,
  C: 7, OC: 7,
  RG: 8, ORG: 8,
  RT: 9, ORT: 9,
  // edge rushers (defensive ends + explicit rush labels). The 3-4-OLB-vs-off-ball
  // ambiguity of the plain "OLB" label is resolved upstream by RosterPositionService
  // (pff_position: ED->edge, LB->off-ball), which relabels edge rushers as "DE".
  DE: 10, LE: 10, E: 10, EDGE: 10, DEFENSIVEEND: 10, LDE: 10, RUSH: 10, RUSHER: 10, EDGERUSHER: 10,
  RE: 11, RDE: 11,
  // interior defensive line
  DT: 12, NT: 12, DL: 12, DG: 12, NG: 12, MIDDLEGUARD: 12, DEFENSIVETACKLE: 12,
  // off-ball linebackers (SAM / Mike / WILL — Madden 26's only LB positions). A plain
  // "OLB" defaults here (off-ball SAM); real edge OLBs get relabeled "DE" upstream.
  LB: 14, MLB: 14, ILB: 14, LILB: 14, RILB: 14, MIKE: 14, MIDDLELINEBACKER: 14, INSIDELINEBACKER: 14,
  OLB: 13, LOLB: 13, SAM: 13, SLB: 13, STRONGSIDELINEBACKER: 13, OUTSIDELINEBACKER: 13,
  ROLB: 15, WILL: 15, WLB: 15, WILB: 15, WEAKSIDELINEBACKER: 15,
  // defensive backs
  CB: 16, DB: 16, CCB: 16, CORNERBACK: 16, CORNER: 16,
  FS: 17, FREESAFETY: 17,
  S: 18, SAF: 18, SAFETY: 18, SS: 18, STRONGSAFETY: 18, DS: 18,
  // specialists
  K: 19, PK: 19, KICKER: 19,
  P: 20, PUNTER: 20,
  LS: 21, LONGSNAPPER: 21,
};

const GROUP: Record<string, string> = {
  QB: 'QB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE',
  LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
  LEDG: 'EDGE', REDG: 'EDGE', DT: 'IDL',
  SAM: 'LB', MIKE: 'LB', WILL: 'LB',
  CB: 'CB', FS: 'S', SS: 'S', K: 'K', P: 'P', LS: 'LS',
};

// Madden 26 position names (byte 0x4a -> label), matching the game's extracted
// position enum (position_lookup.csv): edge ends are LEDG/REDG.
const M26_NAME: Record<number, string> = {
  0: 'QB', 1: 'HB', 2: 'FB', 3: 'WR', 4: 'TE', 5: 'LT', 6: 'LG', 7: 'C',
  8: 'RG', 9: 'RT', 10: 'LEDG', 11: 'REDG', 12: 'DT', 13: 'SAM', 14: 'MIKE',
  15: 'WILL', 16: 'CB', 17: 'FS', 18: 'SS', 19: 'K', 20: 'P', 21: 'LS',
};

/**
 * Curated per-player position overrides for edge rushers the source data
 * mislabels as off-ball LB (PFR lists role-as-position inconsistently). Keyed by
 * normalized first+last name. Extend as needed; an unmatched name is a no-op.
 */
const NAME_OVERRIDES: Record<string, number> = {
  micahparsons: 11, // REDG — plays edge despite an "MLB" listing
  khalilmack: 11,
  vonmiller: 10,
  tjwatt: 10,
  haasonreddick: 11,
  robertquinn: 10,
  zadariussmith: 11,
  demarcusware: 11, // iconic 3-4 edge, listed "MLB" in the source
  lawrencetaylor: 11,
};

function normName(first: string | undefined | null, last: string | undefined | null): string {
  return `${first ?? ''}${last ?? ''}`.toLowerCase().replace(/[^a-z]/g, '');
}

/** Canonical lookup key — strip non-letters and take the first token of a
 *  multi-position label (e.g. "CB/S" -> "CB", "WR/TE" -> "WR"). */
function key(label: string | undefined | null): string {
  if (!label) return '';
  const tokens = String(label).toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  return tokens[0] || '';
}

export const PositionMapper = {
  /** Source label -> M26 position id (0-21). Defaults to WR(3) if unknown. */
  toM26Id(label: string | undefined | null): number {
    const k = key(label);
    return k in M26 ? M26[k] : 3;
  },

  /** Curated name override (edge rushers mislabeled as LB), else null. */
  overrideId(first: string | undefined | null, last: string | undefined | null): number | null {
    const k = normName(first, last);
    return k in NAME_OVERRIDES ? NAME_OVERRIDES[k] : null;
  },

  /** Best M26 id for a player: name override first, then the label mapping. */
  resolve(first: string | undefined | null, last: string | undefined | null, label: string | undefined | null): number {
    return this.overrideId(first, last) ?? this.toM26Id(label);
  },

  /** M26 position id -> coarse rating/dedup group. */
  groupFromId(id: number): string {
    return GROUP[M26_NAME[id] ?? 'WR'] ?? 'WR';
  },

  /** Source label -> coarse group (for dedup keys). */
  groupFromLabel(label: string | undefined | null): string {
    return this.groupFromId(this.toM26Id(label));
  },

  name(id: number): string {
    return M26_NAME[id] ?? 'WR';
  },
};
