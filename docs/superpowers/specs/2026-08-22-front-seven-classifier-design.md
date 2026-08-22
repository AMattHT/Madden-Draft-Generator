# Front-seven role classifier (edge vs off-ball LB) — design

Date: 2026-08-22 · Status: approved verbally by user, implementing.

## Problem
The source CSV lumps nearly every linebacker into "MLB". The only existing
disambiguator (nflverse `pff_position`) has 0% coverage for 1970s/80s rookies
and ~1% for the 90s, so 3-4 OLB pass rushers (Tippett, Swilling, Greg Lloyd…)
become off-ball SAM/MIKE/WILL with LB attribute profiles. Madden has no "OLB":
3-4 OLBs are LEDG/REDG; SAM (strong) / MIKE (middle) / WILL (weak) are the
off-ball slots.

## Signals (priority order)
1. `pff_position` (ED → edge, LB → off-ball) — existing `RosterPositionService`.
2. Career sacks per starting season from `nflverse_draft_picks.csv`
   (`def_sacks`, `def_ints`, `seasons_started`, `games`; 1980+ draftees).
   ≥ 6.0/yr → edge (validated: 39 hits, 0 false positives on 1980–2009).
3. Team base defense by season — new `data/lookups/defensive-schemes.json`
   (3-4 eras per franchise; anything not listed is 4-3; nothing before 1972
   is a 3-4). Joined via the drafting team (pick → team for year classes,
   else nflverse `draft_team`). 3-4 team + sacks ≥ 3/yr → edge; 3-4 team +
   low sacks → MIKE (ILB). 4-3 team + 4.5–6/yr → SAM (blitzing OLB).
4. Interceptions: ≥ 1.0/yr with weight ≤ 240 → WILL (coverage backer).
5. nflverse `position` for 1970s players (OLB/ILB/MLB exist there).
6. Existing name overrides remain the final word.

## Components
- `SchemeService` — loads the JSON, resolves (code, season) → franchise →
  '3-4' | '4-3'. Handles nflverse historical codes (RAM/RAI/PHO/STL/BAL/HOU…)
  and current-code aliases used by `nflverse_players.csv` (LV/LA/KC/GB/NE…).
- `FrontSevenClassifier.classify(input)` — pure, unit-tested.
  Returns `{ role: 'EDGE'|'MIKE'|'SAM'|'WILL'|null, reason, lock }`.
- `FrontSevenService.resolve(player, pickTeam?)` — gathers inputs
  (`NflverseCareerService` gains `defInts`, `games`, `draftTeam`), calls the
  classifier, returns a position label (`DE` / `MIKE` / `SAM` / `WILL` / `OLB`)
  plus the `frontSeven` annotation stored on `BaselinePlayer`.
- `DraftEnrichment.enrichOne` uses it for the LB bucket (replaces `lbFix`).
- `DraftClassBuilder`: locked roles are honoured by `balanceLbByBuild`, which
  now targets Madden's real mix (MIKE 40 / SAM 30 / WILL 30 %) across the whole
  cohort instead of even thirds of the unlocked remainder.
- `PreviewRow.frontSeven` exposes `{ role, reason }` for the UI.
- `scripts/report-front-seven.ts <year...>` prints each LB-bucket player's
  verdict and reason for human audit.

## Testing
`node --import tsx --test` unit tests for the classifier and scheme lookup;
`verify-export.js 2003 / 1965` + typecheck as regression.
