# Madden 27 Draft Class Generator

Turn any real NFL draft from **1936 to 2026** into an importable Madden 27 draft class.

Every player is rated from what he actually did — Pro-Football-Reference's weighted Approximate
Value — then mapped onto the curve Madden's own generated classes follow, so a class looks like
something the game could have produced. Players arrive with era-correct builds, gear and faces,
real drafting teams, and **8,101 real photographs** lifted off the Madden discs.

**[Download the latest release](https://github.com/amatthewsHT/Madden-2026-Draft-Generator/releases/latest)** —
Windows installer or portable exe. Updates itself from GitHub.

> The installers are unsigned, so Windows SmartScreen will warn on first run: *More info → Run
> anyway*. Updates are verified by SHA-512 rather than by signature.

---

## What you get

**The whole draft, not the first round.** 32,140 players across 91 drafts. Years with more players
than Madden's 402 slots (1987 had 554) show you exactly who didn't fit and let you pull any of them
back in — he takes the weakest keeper's place, so every other pick and edit holds.

**Ratings that came from somewhere.** Career value drives the overall; attributes follow each
position's real slope and spread; combine drills are scored within position. The overall Madden
recomputes on import equals the one written — under *every* archetype the game might pick, because
Madden re-derives the archetype from the attributes.

**Real faces where they exist.** 2,803 head scans the installed game can actually render, matched by
name and draft year, with same-name collisions across eras refused. Everyone else gets a generic
head chosen to match his own photograph — hair, facial hair and skin tone — rather than skin tone
alone.

**Real photographs.** 8,101 headshots extracted from eighteen Madden discs, 2001–2017. This matters
because the web is weakest exactly where historical classes need it: the NFL's CDN answers with a
silhouette for most retirees. A portrait prefers the player's own in-game art, then his disc
headshot, then the web.

**Blind scouting.** A class opens with overall, dev trait, career value and all 54 attributes
masked. Tick **Spoilers** to reveal. Columns you can't see can't be sorted by either — hiding a
value while ranking by it isn't hiding it.

**Everything is editable.** Any attribute, bio field, face, gear slot or persona trait. Undo/redo,
edits exportable as JSON, live "the game will show N" recompute, and Variant to re-roll a class.

## Getting a class into Madden

1. Pick a year.
2. Edit anything you like.
3. **Export → Save to Madden Saves** — writes `CAREERDRAFT-<year>DRAFT` straight into the right
   folder, atomically, keeping a `.bak`.
4. In Madden: **Franchise → Choose Draft Class**.

## Building from source

```bash
npm install
cd server && npm install && cd ..
cd web   && npm install && cd ..
npm run app:build:m27        # installer + portable exe in desktop/release/m27/
```

On first launch the app downloads the nflverse datasets and builds its depth-chart caches — a few
minutes. Classes generated before that finishes are marked *degraded* and aren't cached. Refresh the
data later with `npm run data:refresh` from `server/`.

## How the ratings work

Career value is the spine. Where Pro-Football-Reference has a real weighted AV, that's used
directly. Where it doesn't — every undrafted player, and anyone the draft tables never covered —
it's estimated from starts, Pro Bowls, All-Pros and career length, calibrated against the 14,149
players who *do* have a real figure.

That estimate is honest about its own accuracy: mean error 6.2 AV, effectively unbiased, and it
deliberately leaves the top of the range alone. Refitting to improve the middle made stars worse,
because the inputs saturate — a twelve-Pro-Bowl career and an all-time-great one look identical in
starts and selections.

**Realistic** mode rates a class the way a draft-day board would, with a hindsight slider between
that and how players actually turned out. **Career** mode rates outcomes outright.

## Data

| Source | Used for |
|---|---|
| `ALL_PLAYER_LOOKUP.csv` | 32,140 players, 1936–2026: names, colleges, picks, careers, accolades |
| nflverse | draft picks, players, combine, depth charts — downloaded on first run |
| `udfa_careers.json` | careers for undrafted players the draft tables omit, 23 of them Hall of Famers |
| `pre1980-draft-teams.json` | who drafted whom for all 44 pre-1980 drafts, 14,829 names |
| `retro-portraits/` | 8,101 headshots from Madden 2001–2017 |
| `face-assets-by-game.json` | the 2,803 head scans Madden 27 can render |

## Scripts

Run from `server/` unless noted.

| Command | What it does |
|---|---|
| `npm test` | 164 tests, including golden classes (`CI_SKIP_DATA=1` skips those needing the nflverse cache) |
| `npm run verify` | build, write and re-parse real exports |
| `npm run data:refresh` | refresh nflverse CSVs older than 30 days |
| `npm run data:depth` | rebuild the depth-chart position caches |
| `npx tsx scripts/build-retro-headshot-pack.ts` | rebuild the headshot pack from per-disc extractions |
| `npx tsx scripts/build-face-features.ts` | measure heads and players so generic faces can be matched |
| `npx tsx scripts/build-retro-ita.ts` | skin tone from each disc headshot |
| `npx tsx scripts/build-pre1980-draft-teams.ts` | bake pre-1980 drafting teams from Wikipedia |
| `npx tsx scripts/build-face-catalogs.ts` | decode the game's own bundle tables for renderable heads |
| `node scripts/build-calibration.js m27` | rebuild calibration from the game's own generated classes |
| `node ../scripts/publish-release.mjs` | upload both apps into one GitHub release (repo root) |

## API

The app serves its own UI from a local server bound to localhost. Its endpoints:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness + generator fingerprint |
| GET | `/api/about` | version and release notes |
| GET | `/api/draft/years` | draft years available |
| GET | `/api/draft/:year/generated` | the generated class |
| POST | `/api/draft/custom` | all-time / decade classes and modifiers |
| POST | `/api/draft/recompute` | Madden's recomputed overall for an edited player |
| POST | `/api/export/mdc` | build the `.mdc` |
| GET | `/api/portrait/retro/:first/:last?position=` | disc headshot (position guards same-name players) |
| GET | `/api/portrait/dev-icon/:name` | development-trait badge |

## Where the bodies are buried

Things that cost real time to find, kept here so they aren't rediscovered.

**Madden ignores the overall byte** and recomputes from the attributes on import. It ignores the
archetype byte too, keeping whichever archetype scores highest. The builder reconciles attributes so
the intended archetype wins outright.

**A head the game can't render shows the default head**, not nothing. Around 280 legacy asset
directories hold only shader presets, so they're treated as generic.

**Portraits are keyed by PID**, and an unknown PID shows a blank NFL shield. Madden 27 dropped most
retired players' portraits but keeps the legends set under its own ids, so exports try the legends
id first, then the roster's, then a tone-matched generic.

**Names arrive broken in ways that look fine.** 87 players had multi-word surnames split onto the
wrong field — `Last="Noy", First="Kyle Van"`. Concatenated it reads correctly, which is why it hid
for so long, but nothing matched any other source.

**"No career on file" doesn't mean "wrong player."** For undrafted players the career columns are
empty by construction, so a rule reading that as a namesake stripped the Hall of Fame flag from 18
genuine Hall of Famers. Position, not era, disambiguates same-name players — Madden ships legends,
so Walter Payton's real photo is legitimately on a 2012 disc.

**Skin tone from a position-and-era prior is a guess.** The 1999 wide receiver prior is 77% one
tone, which is how a white receiver ended up dark. It's read from the player's own disc headshot
where one exists.

**A test that can't tell present from absent proves nothing.** An early pass concluded the PS3
discs had no headshots because every texture was square and power-of-two — but headshots *are*
square and power-of-two. There are 5,417 on the Madden 13 disc alone.

## Not in the release

Franchise-save tools — cap reset, dev traits, aging, relocation, roster editing — exist in the repo
and work, but only load with `DRAFT_TOOL_FRANCHISE=1`.

Madden 26 is still built by `npm run app:build:m26` and everything above applies to it, but this
README documents Madden 27.
