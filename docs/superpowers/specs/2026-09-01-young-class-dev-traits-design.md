# Dev traits for young classes (awards + production pace) — design

Date: 2026-09-01 · Status: approved by user (rules confirmed in conversation), implementing.

## Problem

Dev traits are handed out by ranking a class on career outcome and applying Madden's
rates from the top (5 X-Factor / 14 Superstar / 90 Star per 402). For classes with
short careers the "outcome" is two seasons of wAV or a draft-slot guess, so whoever
leads a thin sample gets an X-Factor (Stroud, Cam Ward as pick 1). The user's rule:
**X-Factor depends on awards and wAV — never on a quota or a draft slot.**

## Sources

- **AP awards** baked from Wikipedia into `nfl-awards.json` by
  `scripts/build-nfl-awards.ts`: MVP, Offensive Player of the Year, Defensive Player
  of the Year, Offensive Rookie of the Year, Defensive Rookie of the Year, every
  season. Matched to players by normalised name, position group, and award season
  within the player's career (season ≥ draft year).
- **First-team All-Pro (AP1) and Pro Bowl (PB) counts**: already on every lookup row.
- **Production pace**: wAV per completed season ÷ the position group's top-1%
  per-season norm (1990–2015 draftees; QB 9.8, RB 10.3, WR 7.7, TE 5.6, OL 8.3,
  EDGE 7.9, IDL 7.7, LB 8.5, CB 7.1, S 7.1, K 2.6, P 2.3, LS 1.5). Pace 1.0 = a
  Hall-of-Fame-track trajectory; the top-10% line sits near 0.7. (A top-10% bar was
  tried first and cleared by 15 players in 2023, a punter among them.)

## Scope

Applies to players drafted within the last eight completed seasons (2018 onward at
CURRENT_YEAR 2026) in **single-year classes**, under the Realistic and Launch Day
lenses. Everyone else, the Career lens, and mixed classes (all-time, decade,
hand-picked) are unchanged: there a 2018 draftee is ranked against whole careers and
the class keeps Madden's tier shape (an early version applied it there too and the
all-time class came out with as many X-Factors as Superstars).

## Rules (`DevTraitService.youngDev`)

Let S = completed seasons for the player (careerTo or CURRENT_YEAR−1, minus draft
year, plus one; 0 for a class drafted this year), `pace` as above.

1. **X-Factor** iff any of: MVP / OPOY / DPOY; AP1 ≥ 2; Rookie of the Year (unless
   three-plus seasons show it never translated: pace < 0.4); pace ≥ 1.0 AND S ≥ 3 at a
   non-specialist position; the existing elite rule (wAV ≥ 90 or corroborated HOF).
   Rookie of the Year stands on its own because for a one-season player the award is
   the only outcome that exists (McMillan, Schwesinger 2025).
2. **Superstar floor** if any of: AP1 ≥ 1; PB ≥ 2.
3. **Star floor** if PB ≥ 1.
4. Otherwise the tier comes from the pace ranking within the class against a
   **season-scaled quota**: Superstar slots = 14 × clamp((S−1)/3, 0, 1), Star slots
   = 90 × clamp(S/2, 0, 1) (both scaled by class size / 402); floors do not consume
   quota. A quota tier is capped below X-Factor, and at Star for K / P / LS.
5. **Zero-season class (S = 0)**: no wAV exists, so Superstars (12) and Stars (90) go
   by draft slot; X-Factors none.
6. Mixed classes (all-time, decade, hand-picked) do not take this path (see Scope).

The Realistic overall curve is untouched; only `devTrait` changes for young players.

## Expected

2023: X-Factor Stroud (OROY, pace 1.13), Will Anderson (DROY, pace ≥ 1.0), Gibbs
(pace 1.6); Superstars Nacua, Bijan, Flowers, Reed, Achane, … 2024: Daniels (OROY),
Verse (DROY). 2025: McMillan, Schwesinger. 2026: none. 1998: identical to today.

## Testing

Awards parser on real page fixtures (rowspan rows, "C. J. Stroud" spacing, "Will
Anderson Jr."). `DevTraitService` unit tests on synthetic players for every rule.
Builder tests: 2023–2025 named X-Factors and tier counts; 1998 row-for-row identical.
