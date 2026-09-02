# Young-class dev traits (awards + pace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assign dev traits to players drafted in the last eight seasons from AP awards, All-Pro/Pro Bowl counts and wAV production pace, so X-Factor is earned by awards or wAV and never by quota or draft slot.

**Architecture:** `AwardsService` loads a baked `nfl-awards.json` (Wikipedia AP award tables) and answers "which awards did this player win". `DevTraitService.youngDev` is a pure rule engine over per-player inputs. `DraftClassBuilder`'s madden/launch ranking pass calls it for young players after the normal assignment and overrides `devTrait`.

**Tech Stack:** TypeScript, node:test, Wikipedia parse API (bake only).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-01-young-class-dev-traits-design.md`.
- No runtime network. Career lens (`retro`) untouched. Overalls untouched.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; land on master, no release.

---

### Task 1: AwardsService + parser (tested) and the bake script
**Files:** `server/src/services/AwardsService.ts`, `server/scripts/build-nfl-awards.ts`, `server/src/services/__tests__/Awards.test.ts`, output `server/data/lookups/nfl-awards.json`.
- `parseAwardTables(html): { headerCells: string[]; rows: AwardRow[] }[]` → tables headed Season/Player/Position; `AwardRow = { season, first, last, pos }` with rowspan carry-forward for position; player from `data-sort-value="Last, First"`.
- `AwardsService.awardsFor(first, last, draftYear, posGroup, careerTo?)` → `AwardKind[]` (`'MVP'|'OPOY'|'DPOY'|'OROY'|'DROY'`).
- Bake: MVP/OPOY/DPOY pages (first winners table), ROY page (first table = OROY, second = DROY).
- Tests: fixture rows incl. a rowspan row and "C. J. Stroud"; baked-file test (skip when absent) for Stroud OROY 2023 and Will Anderson DROY 2023.

### Task 2: DevTraitService (pure, tested)
**Files:** `server/src/services/DevTraitService.ts`, `server/src/services/__tests__/DevTraitService.test.ts`.
- `PACE_NORMS`, `seasonsCompleted`, `pace`, `youngDev(items, currentYear): Map<key, dev>` per the spec's rules 1–6.
- Tests: each rule on synthetic inputs (award XF; ROY+pace XF vs ROY-only SS; pace≥1 & S≥3 XF; S=2 pace 1.5 → SS not XF; PB floors; S=0 slot ranking gives 12 SS / 90 Star / 0 XF; quota scaling at S=1,2,3).

### Task 3: builder wiring + tests
**Files:** `server/src/services/DraftClassBuilder.ts` (ranking pass), `server/src/services/__tests__/YoungDev.test.ts`.
- After the madden ranking assigns `devTrait`, collect items with `draftYear >= CURRENT_YEAR - 8` (not generated fillers), build inputs (awards via `AwardsService`, ap1/pb/wav/careerTo/round/pick, `elite: isElite(player)`), call `youngDev`, override `it.devTrait`.
- Tests (skipWithoutData + awards file): 2023 X-Factors ⊇ {Stroud, Will Anderson, Gibbs} and ≤ 5; 2024 X-Factors = {Daniels, Verse}; 2025 = {McMillan, Schwesinger}; 2026 has 0 XF and 12 SS; 1998 identical to a snapshot of the pre-change assignment (compare against `retro`-independent expectations: run the builder with young logic disabled via a flag? — simpler: assert 1998 has 5 XF / 14 SS / 90 Star, the Madden shape).

### Task 4: docs
CHANGELOG Unreleased entry; README one sentence under "Three ways to rate a class".
