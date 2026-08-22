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
  // ambiguity of the plain "OLB"/"MLB" labels is resolved upstream by FrontSevenService
  // (PFF position, sack rate, the drafting team's 3-4/4-3 scheme, interceptions),
  // which relabels edge rushers as "DE" and pins off-ball roles as SAM/MIKE/WILL.
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
 * Curated per-player position overrides for well-known players the source data
 * mislabels (PFR/nflverse list role-as-position inconsistently — nearly every
 * front-seven 'backer collapses to "MLB"). Keyed by normalized first+last name.
 * Two kinds, both a no-op if unmatched:
 *   - EDGE (10 LEDG / 11 REDG): pass rushers tagged as off-ball LB. Side is cosmetic.
 *   - off-ball LB ROLE (13 SAM / 14 MIKE / 15 WILL): the data can't tell MIKE from
 *     WILL, so iconic 'backers are pinned to their real role; the build-based split
 *     (balanceLbByBuild) leaves these locked instead of reshuffling them.
 * Extend as needed.
 */
const NAME_OVERRIDES: Record<string, number> = {
  // Edge rushers mislabeled as off-ball LB
  micahparsons: 11, // REDG — plays edge despite an "MLB" listing
  khalilmack: 11,
  vonmiller: 10,
  tjwatt: 10,
  haasonreddick: 11,
  robertquinn: 10,
  zadariussmith: 11,
  demarcusware: 11, // iconic 3-4 edge, listed "MLB" in the source
  lawrencetaylor: 11,
  derrickthomas: 10, // HOF pass rusher tagged "MLB"/OLB — an edge, not an off-ball LB
  kevingreene: 11, // HOF pass rusher (160 sacks), frequently listed as LB
  // Iconic off-ball MIKEs (14) — true middle linebackers
  raylewis: 14,
  brianurlacher: 14,
  patrickwillis: 14,
  lukekuechly: 14,
  bobbywagner: 14,
  // Iconic off-ball WILLs (15) — weakside / coverage 'backers
  lavontedavid: 15,
  derrickbrooks: 15,
  lancebriggs: 15,
  telvinsmith: 15,
};

function normName(first: string | undefined | null, last: string | undefined | null): string {
  return `${first ?? ''}${last ?? ''}`.toLowerCase().replace(/[^a-z]/g, '');
}

/** No data source records the SIDE of a generic edge (LEDG vs REDG) or off-ball
 *  outside LB (SAM vs WILL) — it's a formation role. Distribute deterministically
 *  by name so both Madden slots get realistic use (stable across preview/export;
 *  purely cosmetic — both sides share the same rating group). */
function sideSplit(first: string | undefined | null, last: string | undefined | null, left: number, right: number): number {
  const k = normName(first, last);
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0 ? left : right;
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

  /** Best M26 id for a player: name override first, then the label mapping. Side-less
   *  labels are split by side — LEDG/REDG has no size signal (deterministic hash),
   *  but SAM (strongside) run heavier than WILL (weakside), so off-ball outside LBs
   *  split on weight when known (median ~235 lb), falling back to the hash. */
  resolve(
    first: string | undefined | null,
    last: string | undefined | null,
    label: string | undefined | null,
    weight?: number | null
  ): number {
    const override = this.overrideId(first, last);
    if (override != null) return override;
    const k = key(label);
    // A 290+ lb "end" is a 3-4 five-technique: an interior lineman in Madden terms
    // (Calais Campbell, Cam Heyward, Justin Smith are DTs in the game).
    if ((k === 'DE' || k === 'LE' || k === 'RE' || k === 'E' || k === 'DEFENSIVEEND' || k === 'LDE' || k === 'RDE') && weight != null && weight >= 290) return 12;
    if (k === 'DE' || k === 'E' || k === 'EDGE' || k === 'DEFENSIVEEND') return sideSplit(first, last, 10, 11);
    if (k === 'OLB' || k === 'OUTSIDELINEBACKER') {
      if (weight != null) return weight >= 235 ? 13 : 15; // heavier -> SAM, leaner -> WILL
      return sideSplit(first, last, 13, 15);
    }
    return this.toM26Id(label);
  },

  /**
   * Round-robin the members of a cosmetic position cohort across a whole class so
   * no single side/role dominates. The source data (nflverse) over-concentrates
   * certain positions — nearly all edges arrive labeled "LE" (-> LEDG) and nearly
   * all off-ball LBs as "MLB" (-> MIKE) — so a raw class comes out ~85% LEDG and
   * ~80-98% MIKE. But each cohort shares one rating group (EDGE / LB) with identical
   * profiles, so the specific member is purely cosmetic. We deterministically cycle
   * the cohort's members down the draft board to an even split (counts differ by at
   * most one). Ids outside `members` pass through untouched. Stable: same input
   * order (pick order) yields the same output, so the preview and export match.
   *
   * Cohorts: edges [10 LEDG, 11 REDG]; off-ball LBs [13 SAM, 14 MIKE, 15 WILL].
   */
  balanceCohort(ids: number[], members: number[]): number[] {
    const set = new Set(members);
    let n = 0;
    return ids.map((id) => (set.has(id) ? members[n++ % members.length] : id));
  },

  /**
   * Assign the off-ball LB cohort — SAM(13) / MIKE(14) / WILL(15) — by BUILD, toward
   * Madden's real mix. The source can't tell MIKE from WILL (nearly everyone is tagged
   * "MLB"), but weight is a good proxy for the real spectrum: weakside WILLs are the
   * lightest/fastest (coverage), MIKEs sit in the middle, strongside SAMs are the
   * heaviest (edge-setting). Madden's own generated classes run ~30% SAM / 40% MIKE /
   * 30% WILL (madden-calibration.json), so the WHOLE cohort (locked + unlocked) is
   * targeted at that mix: players already pinned to a role (curated overrides, or a
   * front-seven verdict such as a 3-4 inside backer -> MIKE) keep it and consume that
   * role's quota; the rest are ranked by weight and cut lightest -> WILL, middle ->
   * MIKE, heaviest -> SAM to fill what remains. Ties break by draft order for
   * determinism. Ids outside 13-15 pass through untouched.
   */
  balanceLbByBuild(ids: number[], weights: Array<number | null | undefined>, locked?: boolean[]): number[] {
    const SAM = 13, MIKE = 14, WILL = 15;
    const MIX: Record<number, number> = { [SAM]: 0.3, [MIKE]: 0.4, [WILL]: 0.3 };
    const cohort = ids.map((_, i) => i).filter((i) => ids[i] >= SAM && ids[i] <= WILL);
    const free = cohort.filter((i) => !locked?.[i]);
    const out = ids.slice();
    if (!free.length) return out;

    // Remaining quota per role after the locked players consume theirs.
    const N = cohort.length;
    const target: Record<number, number> = { [SAM]: Math.round(N * MIX[SAM]), [MIKE]: Math.round(N * MIX[MIKE]), [WILL]: 0 };
    target[WILL] = N - target[SAM] - target[MIKE];
    const lockedCount: Record<number, number> = { [SAM]: 0, [MIKE]: 0, [WILL]: 0 };
    for (const i of cohort) if (locked?.[i]) lockedCount[ids[i]]++;
    const need: Record<number, number> = { [SAM]: 0, [MIKE]: 0, [WILL]: 0 };
    for (const r of [SAM, MIKE, WILL]) need[r] = Math.max(0, target[r] - lockedCount[r]);
    let needSum = need[SAM] + need[MIKE] + need[WILL];
    if (needSum === 0) { for (const r of [SAM, MIKE, WILL]) need[r] = MIX[r]; needSum = 1; }

    // Scale the remaining quota onto the free players (largest-remainder rounding).
    const U = free.length;
    const alloc: Record<number, number> = { [SAM]: 0, [MIKE]: 0, [WILL]: 0 };
    const frac: Array<[number, number]> = [];
    let used = 0;
    for (const r of [MIKE, SAM, WILL]) {
      const raw = (need[r] / needSum) * U;
      alloc[r] = Math.floor(raw);
      used += alloc[r];
      frac.push([r, raw - alloc[r]]);
    }
    frac.sort((a, b) => b[1] - a[1]);
    for (let k = 0; used < U; k = (k + 1) % frac.length) { alloc[frac[k][0]]++; used++; }

    const ranked = [...free].sort((a, b) => ((weights[a] ?? 240) - (weights[b] ?? 240)) || a - b);
    ranked.forEach((i, r) => {
      out[i] = r < alloc[WILL] ? WILL : r < alloc[WILL] + alloc[MIKE] ? MIKE : SAM; // lightest .. heaviest
    });
    return out;
  },

  /**
   * Distribute the UNLOCKED members of a cosmetic cohort toward target shares
   * (e.g. { LT: 0.55, RT: 0.45 }), counting locked members against their share
   * first. Unlocked members are assigned in draft order, round-robin weighted by
   * the remaining quota, so the result is deterministic. Ids outside the cohort
   * pass through untouched.
   */
  balanceCohortQuota(ids: number[], shares: Record<number, number>, locked?: boolean[]): number[] {
    const members = Object.keys(shares).map(Number);
    const set = new Set(members);
    const cohort = ids.map((_, i) => i).filter((i) => set.has(ids[i]));
    const free = cohort.filter((i) => !locked?.[i]);
    const out = ids.slice();
    if (!free.length) return out;
    const N = cohort.length;
    const totalShare = members.reduce((s, m) => s + shares[m], 0) || 1;
    const need: Record<number, number> = {};
    for (const m of members) {
      const target = (N * shares[m]) / totalShare;
      const have = cohort.filter((i) => locked?.[i] && ids[i] === m).length;
      need[m] = Math.max(0, target - have);
    }
    // Largest-remainder allocation of the free slots to the members' remaining needs.
    const U = free.length;
    const needSum = members.reduce((s, m) => s + need[m], 0) || 1;
    const alloc: Record<number, number> = {};
    let used = 0;
    const frac: Array<[number, number]> = [];
    for (const m of members) {
      const raw = (need[m] / needSum) * U;
      alloc[m] = Math.floor(raw);
      used += alloc[m];
      frac.push([m, raw - alloc[m]]);
    }
    frac.sort((a, b) => b[1] - a[1]);
    for (let k = 0; used < U; k = (k + 1) % frac.length) { alloc[frac[k][0]]++; used++; }
    // Interleave by draft order: each free slot takes the member with the largest
    // remaining allocation relative to its share (keeps both sides spread down the board).
    const remaining = { ...alloc };
    for (const i of free) {
      let best = members[0], bestScore = -Infinity;
      for (const m of members) {
        const score = remaining[m] / Math.max(1e-9, shares[m]);
        if (remaining[m] > 0 && score > bestScore) { best = m; bestScore = score; }
      }
      out[i] = best;
      remaining[best]--;
    }
    return out;
  },

  /**
   * Corner vs safety for a defensive back by build, for eras with no depth charts
   * (pre-2001). Safeties run heavier than corners: ~196 lb was the line before
   * 1990, ~200 lb after; the biggest safeties are strong safeties. Returns
   * null for a non-DB label.
   */
  dbByBuild(label: string | null | undefined, weight: number | null | undefined, draftYear: number): 'CB' | 'FS' | 'SS' | null {
    const k = key(label);
    const safetyLabel = k === 'S' || k === 'SAF' || k === 'SAFETY' || k === 'FS' || k === 'SS' || k === 'DS';
    const dbLabel = k === 'CB' || k === 'DB' || k === 'CORNERBACK' || k === 'CORNER' || k === 'CCB';
    if (!safetyLabel && !dbLabel) return null;
    if (k === 'FS' || k === 'SS') return k;
    const cornerMax = draftYear < 1990 ? 195 : 199;
    if (dbLabel && (weight == null || weight <= cornerMax)) return 'CB';
    const w = weight ?? 200;
    return w >= 207 ? 'SS' : 'FS';
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
