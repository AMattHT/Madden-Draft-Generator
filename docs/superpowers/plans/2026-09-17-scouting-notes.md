# Scouting Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player two to four sentences of scout's prose derived from his hidden attributes, shown in the profile card's Scouting section, so a blind class can be scouted without seeing a number.

**Architecture:** A pure server module (`ScoutingNotesService`) turns a player's ratings plus the position's calibration profile into z-scores over the position's signature attributes and picks phrases from a JSON table, deterministically by player id. The three places that build rows for the web (`DraftClassBuilder.preview`, `OpenedClassService.rowsFor`, `RosterFileService.buildPlayer`) attach the result as `scouting: string[]`; `ProfileModal` renders it under the blind strip or under the radar chart.

**Tech Stack:** TypeScript, Node `node --test`, React 18 + Tailwind (web), Vite dev servers via `.claude/launch.json` (`server` on 5174, `web` on 5173).

**Spec:** `docs/superpowers/specs/2026-09-17-scouting-notes-design.md`

## Global Constraints

- Branch: `ui-lift`. Stage explicit file lists; never `git add -A`. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Tests: from `server/`, `node --import tsx --test src/services/__tests__/<File>.test.ts`; all: `npm test`. Web typecheck: `npm run typecheck` in `web/`.
- Thresholds: `|z| >= 0.8` mild, `|z| >= 1.6` strong; keep top 3 strengths and top 2 weaknesses by `|z|`, cap 4 lines, strengths first; fewer than 2 lines -> one neutral sentence for the group.
- `std` fallback when the profile has no spread for a key: `8`.
- No digit anywhere in a phrase; no tier words `elite`, `superstar`, `X-Factor`.
- Server signature-attribute table must equal the web `KEY_ATTRS` in `web/src/constants.ts:47-61` (a test enforces group coverage).
- Notes are computed when rows are built for a response, never stored in a class cache. Files added under `server/src/services/` change the generator fingerprint automatically.
- Position groups (server `PositionMapper.groupFromId`): `QB RB WR TE OL EDGE IDL LB CB S K P LS`.

---

### Task 1: Phrase table and signature attributes

**Files:**
- Create: `server/data/lookups/scouting-phrases.json`
- Create: `server/src/services/ScoutingNotesService.ts` (constants and loader only in this task)
- Test: `server/src/services/__tests__/ScoutingNotes.test.ts`

**Interfaces:**
- Produces: `SIGNATURE_ATTRS: Record<string, string[]>` (group -> rating keys), `loadPhrases(): PhraseFile`, types `PhraseFile`, `PhraseCell`.

- [ ] **Step 1: Write the failing completeness test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNATURE_ATTRS, loadPhrases } from '../ScoutingNotesService';

const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'IDL', 'LB', 'CB', 'S', 'K', 'P', 'LS'];

test('every group has signature attributes and a neutral line', () => {
  const phrases = loadPhrases();
  for (const g of GROUPS) {
    assert.ok(SIGNATURE_ATTRS[g]?.length >= 3, `${g} signature attrs`);
    assert.ok(typeof phrases.neutral[g] === 'string' && phrases.neutral[g].length > 10, `${g} neutral`);
  }
});

test('every signature attribute has phrases for both directions and both tiers, no digits, no tier words', () => {
  const phrases = loadPhrases();
  const banned = /\d|\belite\b|superstar|x-factor/i;
  for (const g of GROUPS) {
    for (const key of SIGNATURE_ATTRS[g]) {
      const cell = phrases.attrs[key];
      assert.ok(cell, `${g}.${key} missing`);
      for (const dir of ['strength', 'weakness'] as const) {
        for (const tier of ['strong', 'mild'] as const) {
          const list = cell[dir][tier];
          assert.ok(Array.isArray(list) && list.length >= 2, `${key}.${dir}.${tier} needs two phrasings`);
          for (const s of list) assert.ok(!banned.test(s), `${key}.${dir}.${tier}: "${s}"`);
        }
      }
    }
  }
  for (const s of Object.values(phrases.neutral)) assert.ok(!banned.test(s), s);
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `server/`): `node --import tsx --test src/services/__tests__/ScoutingNotes.test.ts`
Expected: FAIL, cannot find module `../ScoutingNotesService`.

- [ ] **Step 3: Write the phrase file**

`server/data/lookups/scouting-phrases.json`:

```json
{
  "_source": "Written for the blind-scouting card, 2026-09-17. Keep every sentence free of digits and Madden tier words.",
  "neutral": {
    "QB": "Even profile for a quarterback: no standout trait, no glaring hole.",
    "RB": "Even profile for a back: no standout trait, no glaring hole.",
    "WR": "Even profile for a receiver: no standout trait, no glaring hole.",
    "TE": "Even profile for a tight end: no standout trait, no glaring hole.",
    "OL": "Even profile for a lineman: no standout trait, no glaring hole.",
    "EDGE": "Even profile for an edge: no standout trait, no glaring hole.",
    "IDL": "Even profile for an interior lineman: no standout trait, no glaring hole.",
    "LB": "Even profile for a linebacker: no standout trait, no glaring hole.",
    "CB": "Even profile for a corner: no standout trait, no glaring hole.",
    "S": "Even profile for a safety: no standout trait, no glaring hole.",
    "K": "Even profile for a kicker: nothing that separates him from the pack.",
    "P": "Even profile for a punter: nothing that separates him from the pack.",
    "LS": "Even profile for a long snapper: does the job, nothing more to say."
  },
  "attrs": {
    "throwPower": {
      "strength": { "strong": ["Rifle arm that reaches any part of the field", "Drives the deep out on a line, effortlessly"], "mild": ["Arm strength is a plus", "Enough arm for every throw in the book"] },
      "weakness": { "strong": ["Ball dies on deep outs and go routes", "Arm will not stretch a defense"], "mild": ["Arm is ordinary", "Needs a clean pocket to push the ball downfield"] }
    },
    "throwAccuracyShort": {
      "strength": { "strong": ["Surgical in the short game, every ball on the hands", "Puts quick throws exactly where the catch is easy"], "mild": ["Accurate on the short stuff", "Rarely misses an open man underneath"] },
      "weakness": { "strong": ["Sprays the easy throws, drives and stalls", "Short accuracy is a real problem"], "mild": ["Ball placement underneath comes and goes", "Leaves some completions on the field"] }
    },
    "throwAccuracyDeep": {
      "strength": { "strong": ["Drops the deep ball in a bucket", "Deep throws land in stride, play after play"], "mild": ["Can hit a receiver deep when the shot is there", "Deep accuracy is a strength"] },
      "weakness": { "strong": ["Deep ball sails or dies, rarely on target", "Cannot be trusted to throw it long"], "mild": ["Deep accuracy is hit and miss", "Overthrows the long ones more than you would like"] }
    },
    "throwOnTheRun": {
      "strength": { "strong": ["Throws as well moving as standing still", "Escapes and delivers on the move without losing a thing"], "mild": ["Comfortable throwing outside the pocket", "Keeps his mechanics on the move"] },
      "weakness": { "strong": ["Falls apart the moment he has to move", "Accuracy vanishes when the pocket breaks"], "mild": ["Better with his feet set", "Throws off platform are an adventure"] }
    },
    "awareness": {
      "strength": { "strong": ["Sees the whole field, always a step ahead", "Football intelligence jumps off the tape"], "mild": ["Smart player who rarely gets fooled", "Processes the game quickly"] },
      "weakness": { "strong": ["Reads are slow and often wrong", "Gets lost when the picture changes"], "mild": ["Still learning to read the game", "A beat late to react at times"] }
    },
    "speed": {
      "strength": { "strong": ["Speed jumps off the tape, pulls away from everyone", "Game-breaking speed"], "mild": ["Faster than most at his spot", "Has the speed to threaten"] },
      "weakness": { "strong": ["Gets caught from behind; a real speed deficit", "Straight-line speed is well below the line"], "mild": ["Not a burner", "Speed is a limitation"] }
    },
    "acceleration": {
      "strength": { "strong": ["Reaches top gear in two steps", "Explodes out of his stance"], "mild": ["Quick to get going", "Good first-step burst"] },
      "weakness": { "strong": ["Slow to build speed, a lumbering start", "No burst to speak of"], "mild": ["Takes a while to get up to speed", "First step is ordinary"] }
    },
    "agility": {
      "strength": { "strong": ["Changes direction without slowing, hips like a dancer", "Makes defenders miss in a phone booth"], "mild": ["Moves well laterally", "Fluid in tight spaces"] },
      "weakness": { "strong": ["Stiff and upright, turns like a truck", "Cannot change direction under control"], "mild": ["A little stiff in the hips", "Lateral movement is average at best"] }
    },
    "breakTackle": {
      "strength": { "strong": ["Runs through arm tackles like they are not there", "Needs a crowd to bring him down"], "mild": ["Breaks his share of tackles", "Hard to get to the ground with one man"] },
      "weakness": { "strong": ["Goes down at first contact", "No power through contact at all"], "mild": ["Does not break many tackles", "Contact usually ends the run"] }
    },
    "carrying": {
      "strength": { "strong": ["Ball security is never a question", "Keeps the ball high and tight through every hit"], "mild": ["Takes care of the football", "Fumbles are rare"] },
      "weakness": { "strong": ["Puts the ball on the ground far too often", "Ball security is a real worry"], "mild": ["Loose with the ball at times", "Has had fumbling trouble"] }
    },
    "ballCarrierVision": {
      "strength": { "strong": ["Sees the cutback before the hole opens", "Patience and vision of a veteran"], "mild": ["Finds the right lane more often than not", "Good feel for where the run is going"] },
      "weakness": { "strong": ["Runs into the back of his own linemen", "No feel for the hole"], "mild": ["Vision is still developing", "Misses a cutback here and there"] }
    },
    "jukeMove": {
      "strength": { "strong": ["Juke leaves tacklers grabbing air", "Shifty enough to embarrass a defender"], "mild": ["Has a move in the open field", "Can make one man miss"] },
      "weakness": { "strong": ["No wiggle, runs straight into tacklers", "Cannot make anyone miss"], "mild": ["Not much of an open-field move", "More north-south than shifty"] }
    },
    "catching": {
      "strength": { "strong": ["Hands like glue, plucks everything", "Never lets the ball into his body"], "mild": ["Reliable hands", "Catches what he should"] },
      "weakness": { "strong": ["Drops are a real issue, fights the ball", "Cannot be trusted to hold on"], "mild": ["Hands are inconsistent", "Drops a few he should have"] }
    },
    "shortRouteRunning": {
      "strength": { "strong": ["Snaps off short routes and is open every time", "Creates separation underneath at will"], "mild": ["Runs clean short routes", "Gets open on quick stuff"] },
      "weakness": { "strong": ["Rounds off every short route, never open", "Short routes are sloppy"], "mild": ["Short routes need work", "Struggles to separate underneath"] }
    },
    "deepRouteRunning": {
      "strength": { "strong": ["Stacks corners and tracks the deep ball like a center fielder", "A true vertical threat"], "mild": ["Wins downfield more often than not", "Good on the deep routes"] },
      "weakness": { "strong": ["Cannot get behind a defense", "Deep routes go nowhere"], "mild": ["Not much of a deep threat", "Downfield routes are a weakness"] }
    },
    "release": {
      "strength": { "strong": ["Beats press off the line with ease", "Cannot be jammed"], "mild": ["Handles press coverage", "Gets off the line cleanly"] },
      "weakness": { "strong": ["Gets stuck at the line against press", "A jam takes him out of the play"], "mild": ["Press coverage bothers him", "Release is slow"] }
    },
    "catchInTraffic": {
      "strength": { "strong": ["Catches through contact like it is nothing", "Fearless over the middle"], "mild": ["Holds on when hit", "Willing to work the middle"] },
      "weakness": { "strong": ["Alligator arms in traffic", "Hears footsteps over the middle"], "mild": ["Struggles to hold on through contact", "Not comfortable in traffic"] }
    },
    "runBlock": {
      "strength": { "strong": ["Moves people in the run game, a mauler", "Drive blocks finish in the second level"], "mild": ["Solid run blocker", "Gets movement at the point"] },
      "weakness": { "strong": ["Gets no push at all", "Run blocking is a liability"], "mild": ["Run blocking is average", "Struggles to sustain run blocks"] }
    },
    "strength": {
      "strength": { "strong": ["Raw power that shows on every snap", "Overpowers whoever lines up across from him"], "mild": ["Plenty strong for the position", "Wins with power when he needs to"] },
      "weakness": { "strong": ["Gets pushed around, needs a lot of weight room time", "Plays weak"], "mild": ["Strength is a concern", "Could stand to get stronger"] }
    },
    "passBlock": {
      "strength": { "strong": ["A wall in pass protection", "Nobody gets past him"], "mild": ["Reliable in pass protection", "Holds up one on one"] },
      "weakness": { "strong": ["Pass protection is a disaster", "Gets beaten inside and out"], "mild": ["Pass protection needs work", "Loses some reps in protection"] }
    },
    "impactBlocking": {
      "strength": { "strong": ["Blocks that knock defenders flat", "Finishes with a thud"], "mild": ["Delivers a punch as a blocker", "Blocks with attitude"] },
      "weakness": { "strong": ["Blocks without any pop", "Catches defenders instead of hitting them"], "mild": ["Not a physical blocker", "Blocks are more position than punishment"] }
    },
    "runBlockPower": {
      "strength": { "strong": ["Power run blocks that bury people", "A bulldozer in the run game"], "mild": ["Wins run blocks with power", "Good drive block"] },
      "weakness": { "strong": ["No power in his run blocks at all", "Gets stood up on drive blocks"], "mild": ["Power blocking is not his strength", "Drive block lacks pop"] }
    },
    "powerMoves": {
      "strength": { "strong": ["Bull rush collapses the pocket", "Walks blockers back into the quarterback"], "mild": ["Has a power rush to lean on", "Bull rush is effective"] },
      "weakness": { "strong": ["Power rush goes nowhere", "Gets swallowed by bigger blockers"], "mild": ["Power moves are a work in progress", "Not much of a bull rush"] }
    },
    "finesseMoves": {
      "strength": { "strong": ["Spin and swim moves that leave blockers grasping", "Rush repertoire of a veteran"], "mild": ["Has a couple of pass-rush moves", "Can win with quickness and hands"] },
      "weakness": { "strong": ["No pass-rush moves at all", "Runs straight into blockers"], "mild": ["Pass-rush moves are raw", "Hands need work"] }
    },
    "blockShedding": {
      "strength": { "strong": ["Sheds blocks like he is brushing off dust", "Blockers cannot stay on him"], "mild": ["Gets off blocks well", "Works free of blockers"] },
      "weakness": { "strong": ["Stays blocked all day", "Cannot get off a block"], "mild": ["Slow to shed blocks", "Blockers stick to him"] }
    },
    "pursuit": {
      "strength": { "strong": ["Chases everything down, sideline to sideline", "Relentless in pursuit"], "mild": ["Good pursuit angles", "Runs to the ball"] },
      "weakness": { "strong": ["Takes himself out of plays with bad angles", "Pursuit effort is missing"], "mild": ["Pursuit angles could be tighter", "Not always around the ball"] }
    },
    "tackle": {
      "strength": { "strong": ["Sure tackler, nobody slips through", "Wraps up and finishes every time"], "mild": ["Dependable tackler", "Rarely misses in the open field"] },
      "weakness": { "strong": ["Misses far too many tackles", "Tackling is a real problem"], "mild": ["Misses some tackles he should make", "Tackling technique needs work"] }
    },
    "playRecognition": {
      "strength": { "strong": ["Diagnoses the play before the snap is over", "Reads keys like a coach"], "mild": ["Reads plays well", "Rarely fooled by misdirection"] },
      "weakness": { "strong": ["Bites on everything", "Slow to diagnose, often out of position"], "mild": ["Play recognition is still developing", "Can be fooled by play action"] }
    },
    "hitPower": {
      "strength": { "strong": ["Hits that change games, ball carriers feel him", "A thumper"], "mild": ["Brings a pop when he arrives", "Physical tackler"] },
      "weakness": { "strong": ["Tackles without any force", "Drag-down tackler, no punch"], "mild": ["Not a big hitter", "Tackles are more grab than hit"] }
    },
    "zoneCoverage": {
      "strength": { "strong": ["Owns his zone, quarterbacks look elsewhere", "Instincts in zone are exceptional"], "mild": ["Comfortable in zone", "Good feel for his drop"] },
      "weakness": { "strong": ["Lost in zone, receivers run free behind him", "Zone coverage is a liability"], "mild": ["Zone instincts need sharpening", "Drifts in zone"] }
    },
    "manCoverage": {
      "strength": { "strong": ["Blankets receivers in man, a true shutdown player", "Sticks to his man like glue"], "mild": ["Holds up in man coverage", "Can be trusted on an island"] },
      "weakness": { "strong": ["Gets beaten badly in man", "Cannot be left alone with a receiver"], "mild": ["Man coverage is a weakness", "Loses receivers at the break"] }
    },
    "pressCoverage": {
      "strength": { "strong": ["Jams receivers off the line and wrecks the route", "Press technique is textbook"], "mild": ["Can press at the line", "Gets hands on receivers early"] },
      "weakness": { "strong": ["Whiffs at the line, receivers run right past", "Press coverage is a mess"], "mild": ["Press technique needs work", "Not much of a jam"] }
    },
    "kickPower": {
      "strength": { "strong": ["Leg that reaches from anywhere past midfield", "Booming leg"], "mild": ["Strong leg", "Range is a plus"] },
      "weakness": { "strong": ["Leg falls well short of the pack", "Cannot reach from long range"], "mild": ["Leg strength is ordinary", "Range is limited"] }
    },
    "kickAccuracy": {
      "strength": { "strong": ["Splits the uprights every time", "Money when it matters"], "mild": ["Accurate kicker", "Rarely misses the makeable ones"] },
      "weakness": { "strong": ["Sprays kicks all over the place", "Accuracy is a real worry"], "mild": ["Accuracy is inconsistent", "Misses more than he should"] }
    },
    "longSnap": {
      "strength": { "strong": ["Snaps are laser-guided, never a bad one", "As reliable a snapper as you will find"], "mild": ["Consistent snapper", "Snaps arrive on time and on target"] },
      "weakness": { "strong": ["Snaps wander, a real problem on kicks", "Cannot be trusted to snap it clean"], "mild": ["Snap consistency is shaky", "An occasional high snap"] }
    }
  }
}
```

- [ ] **Step 4: Write the constants and loader**

`server/src/services/ScoutingNotesService.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../config/paths';

/**
 * Scout's read for the blind-scouting card: two to four sentences derived from the
 * hidden attributes, never a number. Thresholds are in position standard deviations
 * (see docs/superpowers/specs/2026-09-17-scouting-notes-design.md).
 */

/** Signature attributes per position group. MUST mirror KEY_ATTRS in web/src/constants.ts. */
export const SIGNATURE_ATTRS: Record<string, string[]> = {
  QB: ['throwPower', 'throwAccuracyShort', 'throwAccuracyDeep', 'throwOnTheRun', 'awareness', 'speed'],
  RB: ['speed', 'acceleration', 'agility', 'breakTackle', 'carrying', 'ballCarrierVision', 'jukeMove'],
  WR: ['speed', 'catching', 'shortRouteRunning', 'deepRouteRunning', 'release', 'agility', 'catchInTraffic'],
  TE: ['catching', 'shortRouteRunning', 'runBlock', 'speed', 'strength', 'catchInTraffic'],
  OL: ['runBlock', 'passBlock', 'strength', 'awareness', 'impactBlocking', 'runBlockPower'],
  EDGE: ['powerMoves', 'finesseMoves', 'speed', 'strength', 'blockShedding', 'pursuit', 'tackle'],
  IDL: ['powerMoves', 'blockShedding', 'strength', 'tackle', 'pursuit', 'playRecognition'],
  LB: ['tackle', 'speed', 'pursuit', 'playRecognition', 'hitPower', 'zoneCoverage', 'blockShedding'],
  CB: ['speed', 'manCoverage', 'zoneCoverage', 'pressCoverage', 'acceleration', 'playRecognition', 'catching'],
  S: ['speed', 'zoneCoverage', 'manCoverage', 'tackle', 'hitPower', 'playRecognition', 'pursuit'],
  K: ['kickPower', 'kickAccuracy', 'awareness'],
  P: ['kickPower', 'kickAccuracy', 'awareness'],
  LS: ['longSnap', 'awareness', 'strength'],
};

export interface PhraseCell { strength: { strong: string[]; mild: string[] }; weakness: { strong: string[]; mild: string[] } }
export interface PhraseFile { _source?: string; neutral: Record<string, string>; attrs: Record<string, PhraseCell> }

let phrases: PhraseFile | null = null;
export function loadPhrases(): PhraseFile {
  if (phrases) return phrases;
  phrases = JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, 'scouting-phrases.json'), 'utf8')) as PhraseFile;
  return phrases;
}
```

- [ ] **Step 5: Run the test**

Run (from `server/`): `node --import tsx --test src/services/__tests__/ScoutingNotes.test.ts`
Expected: 2 passing. Then `npm run typecheck` from `server/`: no output.

- [ ] **Step 6: Commit**

```bash
git add server/data/lookups/scouting-phrases.json server/src/services/ScoutingNotesService.ts server/src/services/__tests__/ScoutingNotes.test.ts
git commit -m "Scouting notes: phrase table and the signature attributes per position

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The notes engine

**Files:**
- Modify: `server/src/services/ScoutingNotesService.ts`
- Test: `server/src/services/__tests__/ScoutingNotes.test.ts` (append)

**Interfaces:**
- Produces:
  - `scoutingNotes(input: { id: number; positionId: number; ratings: Record<string, number>; profile: PosProfile }): string[]`
  - `scoutingFor(id: number, positionId: number, ratings: Record<string, number>, version: 'm26' | 'm27'): string[]` (fetches the profile via `CalibrationService.positionProfile(PositionMapper.name(positionId), version)`)
- Consumes: `PosProfile` from `CalibrationService` (`attrs` = per-attribute mean, `attrStats?.[key]?.std`).

- [ ] **Step 1: Append the failing engine tests**

```ts
import { scoutingNotes } from '../ScoutingNotesService';
import type { PosProfile } from '../CalibrationService';

/** A flat profile: every signature attribute averages `mean` with spread `std`. */
function profile(keys: string[], mean = 70, std = 10): PosProfile {
  const attrs: Record<string, number> = {}, attrStats: PosProfile['attrStats'] = {};
  for (const k of keys) { attrs[k] = mean; attrStats[k] = { slope: 1, std, residStd: std, min: 40, max: 99 }; }
  return { ovrMean: mean, archetypeMode: 0, archetypeDist: {}, htMean: 72, htStd: 2, wtMean: 210, wtStd: 15, attrs, attrStats };
}
const QB = 0, HB = 1;
const flat = (keys: string[], v = 70) => Object.fromEntries(keys.map((k) => [k, v]));

test('mild and strong thresholds pick the right cell', () => {
  const keys = SIGNATURE_ATTRS.QB, p = loadPhrases();
  const mild = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 78, speed: 62 }, profile: profile(keys) });
  assert.equal(mild.length, 2);
  assert.ok(p.attrs.throwPower.strength.mild.includes(mild[0]), mild[0]);
  assert.ok(p.attrs.speed.weakness.mild.includes(mild[1]), mild[1]);
  const strong = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 86, speed: 54 }, profile: profile(keys) });
  assert.ok(p.attrs.throwPower.strength.strong.includes(strong[0]), strong[0]);
  assert.ok(p.attrs.speed.weakness.strong.includes(strong[1]), strong[1]);
});

test('within +/- 0.8 std nothing qualifies and the neutral line is returned', () => {
  const keys = SIGNATURE_ATTRS.QB;
  const notes = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 77, speed: 63 }, profile: profile(keys) });
  assert.deepEqual(notes, [loadPhrases().neutral.QB]);
});

test('one qualifying line is not enough: neutral', () => {
  const keys = SIGNATURE_ATTRS.QB;
  const notes = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 90 }, profile: profile(keys) });
  assert.deepEqual(notes, [loadPhrases().neutral.QB]);
});

test('cap at four lines, strengths first, each side ordered by magnitude', () => {
  const keys = SIGNATURE_ATTRS.RB, p = loadPhrases();
  // z: speed +2.5, acceleration +2.0, agility +1.5, breakTackle +1.0, carrying +0.9, ballCarrierVision -2.2, jukeMove -1.0
  const ratings = { speed: 95, acceleration: 90, agility: 85, breakTackle: 80, carrying: 79, ballCarrierVision: 48, jukeMove: 60 };
  const notes = scoutingNotes({ id: 7, positionId: HB, ratings, profile: profile(keys) });
  assert.equal(notes.length, 4);
  assert.ok(p.attrs.speed.strength.strong.includes(notes[0]));
  assert.ok(p.attrs.acceleration.strength.strong.includes(notes[1]));
  assert.ok(p.attrs.agility.strength.mild.includes(notes[2]));
  assert.ok(p.attrs.ballCarrierVision.weakness.strong.includes(notes[3]));
});

test('missing spread falls back to a std of 8', () => {
  const keys = SIGNATURE_ATTRS.QB, p = loadPhrases();
  const prof = profile(keys); delete prof.attrStats;
  // 70 + 0.8 * 8 = 76.4 -> 77 qualifies; 70 - 1.6 * 8 = 57.2 -> 57 is strong
  const notes = scoutingNotes({ id: 1, positionId: QB, ratings: { ...flat(keys), throwPower: 77, speed: 57 }, profile: prof });
  assert.ok(p.attrs.throwPower.strength.mild.includes(notes[0]));
  assert.ok(p.attrs.speed.weakness.strong.includes(notes[1]));
});

test('deterministic by id, and different ids can pick different phrasings', () => {
  const keys = SIGNATURE_ATTRS.QB;
  const ratings = { ...flat(keys), throwPower: 90, speed: 50 };
  const a = scoutingNotes({ id: 3, positionId: QB, ratings, profile: profile(keys) });
  const b = scoutingNotes({ id: 3, positionId: QB, ratings, profile: profile(keys) });
  assert.deepEqual(a, b);
  const firsts = new Set<string>();
  for (let id = 1; id <= 40; id++) firsts.add(scoutingNotes({ id, positionId: QB, ratings, profile: profile(keys) })[0]);
  assert.ok(firsts.size >= 2, 'forty ids should spread over both phrasings');
});
```

Update the first import line of the test file to `import { SIGNATURE_ATTRS, loadPhrases, scoutingNotes } from '../ScoutingNotesService';` and drop the duplicate import added above.

- [ ] **Step 2: Run to see the new tests fail**

Run (from `server/`): `node --import tsx --test src/services/__tests__/ScoutingNotes.test.ts`
Expected: 2 pass, 6 FAIL (`scoutingNotes is not a function`).

- [ ] **Step 3: Implement the engine**

Add two imports at the top of `server/src/services/ScoutingNotesService.ts`:

```ts
import { PositionMapper } from './PositionMapper';
import { CalibrationService, type PosProfile } from './CalibrationService';
```

Then append:

```ts
export interface ScoutingInput { id: number; positionId: number; ratings: Record<string, number>; profile: PosProfile }

const MILD = 0.8, STRONG = 1.6, FALLBACK_STD = 8;
const MAX_STRENGTHS = 3, MAX_WEAKNESSES = 2, MAX_LINES = 4, MIN_LINES = 2;

/** FNV-1a over "id|key": stable across runs and machines. */
function hash(id: number, key: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${id}|${key}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

export function scoutingNotes({ id, positionId, ratings, profile }: ScoutingInput): string[] {
  const group = PositionMapper.groupFromId(positionId);
  const keys = SIGNATURE_ATTRS[group] ?? SIGNATURE_ATTRS.WR;
  const phrases = loadPhrases();
  const scored = keys.map((key) => {
    const mean = Number(profile.attrs?.[key]);
    const std = Number(profile.attrStats?.[key]?.std) || FALLBACK_STD;
    const value = Number(ratings[key]);
    const z = Number.isFinite(mean) && Number.isFinite(value) ? (value - mean) / std : 0;
    return { key, z, abs: Math.abs(z) };
  });
  const strengths = scored.filter((s) => s.z >= MILD).sort((a, b) => b.abs - a.abs).slice(0, MAX_STRENGTHS);
  const weaknesses = scored.filter((s) => s.z <= -MILD).sort((a, b) => b.abs - a.abs).slice(0, MAX_WEAKNESSES);
  const picked = [...strengths, ...weaknesses].slice(0, MAX_LINES);
  if (picked.length < MIN_LINES) return [phrases.neutral[group] ?? phrases.neutral.WR];
  return picked.map(({ key, z, abs }) => {
    const cell = phrases.attrs[key];
    const list = cell[z > 0 ? 'strength' : 'weakness'][abs >= STRONG ? 'strong' : 'mild'];
    return list[hash(id, key) % list.length];
  });
}

/** Notes from the calibration profile of the player's position (the same profile his ratings were generated against). */
export function scoutingFor(id: number, positionId: number, ratings: Record<string, number>, version: 'm26' | 'm27'): string[] {
  return scoutingNotes({ id, positionId, ratings, profile: CalibrationService.positionProfile(PositionMapper.name(positionId), version) });
}
```

- [ ] **Step 4: Run the tests**

Run (from `server/`): `node --import tsx --test src/services/__tests__/ScoutingNotes.test.ts`
Expected: 8 passing. Then `npm run typecheck` from `server/`: no output.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/ScoutingNotesService.ts server/src/services/__tests__/ScoutingNotes.test.ts
git commit -m "Scouting notes: z-score engine over the position's signature attributes, phrased by id

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Attach notes to every row the web receives

**Files:**
- Modify: `server/src/services/DraftClassBuilder.ts:506-556` (`PreviewRow`) and `:1034-1037` (row literal in `preview`)
- Modify: `server/src/services/OpenedClassService.ts:104-140` (row literal in `rowsFor`)
- Modify: `server/src/services/RosterFileService.ts:35-70` (`RosterPlayer`) and the `return {` of `buildPlayer` (~line 218-250)
- Modify: `web/src/types.ts:1-46` (`PlayerRow`) and `:225-250` (`RosterPlayer`)
- Modify: `web/src/rosterCard.ts:18-55` (`rowFor`)

**Interfaces:**
- Consumes: `scoutingFor` from Task 2.
- Produces: `scouting?: string[]` on server `PreviewRow` and `RosterPlayer`, on web `PlayerRow` and `RosterPlayer`.

- [ ] **Step 1: Server types**

In `DraftClassBuilder.ts`, inside `export interface PreviewRow` add after `ratings: Record<string, number>;`:

```ts
  /** Scout's read: two to four sentences from the hidden attributes, no numbers (ScoutingNotesService). */
  scouting?: string[];
```

In `RosterFileService.ts`, inside `export interface RosterPlayer` add after `ratings: Record<string, number>;` the same two lines.

- [ ] **Step 2: Draft preview rows**

In `DraftClassBuilder.ts` add the import near the other service imports at the top of the file:

```ts
import { scoutingFor } from './ScoutingNotesService';
```

In the `preview` method's row literal, directly after the line `ratings,` (about line 1036) add:

```ts
        scouting: scoutingFor(i + 1, Number(p.position), ratings, gameVersion),
```

- [ ] **Step 3: Opened-class rows**

In `OpenedClassService.ts` add the import:

```ts
import { scoutingFor } from './ScoutingNotesService';
```

In `rowsFor`, the row literal ends with `ratings,` then `} as PreviewRow;`. Directly after `ratings,` add:

```ts
      scouting: scoutingFor(i + 1, posId, ratings, e.gameVersion),
```

- [ ] **Step 4: Roster rows**

In `RosterFileService.ts` add the import:

```ts
import { scoutingFor } from './ScoutingNotesService';
```

In `buildPlayer`, directly after the `ratings,` line inside `return {` add:

```ts
    scouting: scoutingFor(intOf(r, 'PGID'), positionId, ratings, 'm27'),
```

- [ ] **Step 5: Web types and roster card**

In `web/src/types.ts`, in `PlayerRow` after `ratings: Record<string, number>; // full editable attribute set` add:

```ts
  scouting?: string[]; // scout's read (server-generated, no numbers)
```

In `RosterPlayer` (line ~225) after its `ratings: Record<string, number>;` add the same line.

In `web/src/rosterCard.ts` `rowFor`, after `ratings: p.ratings,` add:

```ts
    scouting: p.scouting,
```

- [ ] **Step 6: Typecheck both packages and run the server tests**

Run: `npm run typecheck` in `server/` and in `web/`. Expected: no output.
Run: `npm test` in `server/`. Expected: all passing (`OpenedClass.test.ts` and `ExportRoundTrip.test.ts` still pass; the new field is optional).

- [ ] **Step 7: Commit**

```bash
git add server/src/services/DraftClassBuilder.ts server/src/services/OpenedClassService.ts server/src/services/RosterFileService.ts web/src/types.ts web/src/rosterCard.ts
git commit -m "Scouting notes ride on every class, opened-file and roster row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Render in the profile card, verify in the preview, changelog

**Files:**
- Modify: `web/src/components/ProfileModal.tsx:548-573` (Scouting section)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the list under the Scouting section**

In `ProfileModal.tsx`, the Scouting section is:

```tsx
        <div ref={scoutingRef} className="scroll-mt-36 border-b border-white/[0.06] px-5 py-4">
          {spoilers ? ( ...radar... ) : ( ...blind strip with Reveal... )}
        </div>
```

Insert the following block directly before that section's closing `</div>` (after the ternary's closing `)}`):

```tsx
          {row.scouting && row.scouting.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Scout's read</div>
              <ul className="space-y-1 text-[13px] leading-snug text-neutral-200">
                {row.scouting.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neutral-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` in `web/`. Expected: no output.

- [ ] **Step 3: Verify in the preview**

Start both servers with `preview_start` (`server`, then `web`). In the web tab: open any year class (spoilers are off by default), click a player row to open the card, then `read_page` and confirm the Scouting section contains a "Scout's read" heading followed by two to four list items, with the blind strip and its Reveal button still above them. Confirm with `find` that no digit appears inside the list items. Tick Spoilers and confirm the radar chart appears and the list stays. Open the Rosters view, open a roster, open a player: the list appears under the chart. Take one screenshot of the blind card for the user.

- [ ] **Step 4: Changelog**

Under `## Unreleased` / `### Features` in `CHANGELOG.md` (create the section under `# Changelog` if it is not there) add:

```markdown
- Scout's read: every player's card carries two to four lines of scouting prose drawn from his attributes ("Rifle arm that reaches any part of the field", "Loses receivers at the break"), so a blind class can be scouted without seeing a number.
```

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ProfileModal.tsx CHANGELOG.md
git commit -m "Profile card: scout's read under the blind strip and the radar chart

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
