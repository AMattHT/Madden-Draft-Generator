# Madden 26 / 27 NFL Draft Class Generator

Generate importable Madden 26 **and Madden 27** draft classes (`CAREERDRAFT-*`) from real NFL draft
history (1936–2026), rated from Pro-Football-Reference **weighted Approximate Value (wAV)** and
calibrated against the games' own generated classes. AFL and NFL drafts are merged for 1960–66,
undrafted stars get their careers, players get era-correct builds, faces, gear and (M27) persona DNA.
A set of franchise-save tools (cap reset, dev traits, aging, relocation, roster editing) rounds it out.

React web app + local Node backend. Run `npm run dev`, open **http://localhost:5173**.

## What it does

| Area | State |
|---|---|
| `.mdc` engines | M26 (4296-byte blocks, zstd visuals) and M27 (5876-byte blocks, uncompressed visuals, persona DNA, header prospect count) — round-trip verified against the games' own files |
| Player pool | 32k rows 1936–2026 (`ALL_PLAYER_LOOKUP.csv`) + nflverse draft picks / players / combine / depth charts + curated careers for undrafted stars (`udfa_careers.json`) |
| Ratings | **Realistic** mode maps career caliber onto Madden's empirical rookie curve (mean 66, max 84–86) with a **hindsight** slider (draft-day board ↔ career outcome) and **auto class strength**; **Career** mode rates how players actually turned out. Attributes follow each position's slope/spread from the real classes; combine drills are scored within position; the overall Madden recomputes on import equals the one written |
| Positions | 3-4 OLB pass rushers become LEDG/REDG (PFF → sack rate → team scheme table → interceptions); SAM/MIKE/WILL, LT/RT, LG/RG, FS/SS balanced to Madden's own mix around real depth-chart slots |
| Likeness | Real face scans per game, generic heads from each game's own head set with correct portrait ids, skin tone from portraits/Wikipedia with an era prior, era-correct helmets/cleats/gloves/pads/sleeves (M27 asset allowlist), announcer ids by surname |
| M27 extras | Persona DNA sampled from the game's rookies, PersonalityRating, Focus, QB style, birthdate, body-type enum — everything the game reads back verbatim |
| Franchise tools | Work on M26 **and** M27 saves (a save from the other game is refused): cap reset (M27 contract table aware), heal injuries / dev traits, position-aware trait realism, **advance the roster N seasons** (age, retire, decline), free-agent trim, draft-pick reset, relocation/rebrand, schedule viewer, per-player roster editor |
| Editing | Every attribute / bio / face / gear / persona editable; undo/redo; export/import edits as JSON; "game shows N" live recompute; Variant re-rolls; Save straight into the Madden Saves folder (atomic, keeps a `.bak`) |
| Tests | `npm test` (91 tests incl. golden classes), `npm run verify` (export round-trips), `npm run verify:franchise` (every franchise tool on copies of both autosaves) |

The full audit that drove the last round of work is in
[`docs/improvement-report-2026-08-22.html`](docs/improvement-report-2026-08-22.html); the M27 binary
field map is in [`../M27-PORT.md`](../M27-PORT.md).

## Run

```bash
npm install                     # root: concurrently
cd server && npm install && cd ..
cd web && npm install && cd ..
npm run dev                     # backend (tsx watch, :5174) + Vite (:5173); frees stale dev ports first
```

First run downloads the nflverse datasets into `server/cache/` (a few minutes) and builds the
depth-chart position caches; classes generated before that finishes are flagged *degraded* and not
cached by the browser. Refresh the data later with `npm run data:refresh` (30-day max age).

Export: class header → **Export → Save to Madden Saves** (writes `CAREERDRAFT-<year>DRAFT` into the
right game's Saves folder), then in Madden: Franchise → Choose Draft Class.

## Scripts (server/)

| Command | What |
|---|---|
| `npm test` | unit + golden tests (`CI_SKIP_DATA=1` skips the ones that need the nflverse cache) |
| `npm run verify` | `verify-export.js 2003 / 1965` + `verify-m27.js` — build, write, re-parse |
| `npm run verify:franchise` | every franchise tool against temp copies of the M26 and M27 autosaves |
| `npm run data:refresh [-- --force]` | refresh nflverse CSVs older than 30 days |
| `npm run data:depth` | rebuild the depth-chart position caches |
| `npx tsx scripts/report-front-seven.ts 1980-1989 [--counts]` | audit edge-vs-off-ball verdicts, or position counts vs Madden |
| `node scripts/build-calibration.js [m26\|m27]` | rebuild `madden-calibration[-m27].json` from game-generated classes in the Saves folders |
| `npx tsx scripts/build-m27-field-stats.ts` | mine M27 field distributions, surname → announcer ids, rookie persona mix |
| `npx tsx scripts/build-generic-heads.ts` | per-game generic-head catalogs + portrait ids |
| `python scripts/fit-ovrweights.py [m26\|m27]` | refit overall-formula overrides where `ovrweights.json` disagrees with the game |
| `npx tsx scripts/build-skintone.ts` | rebuild portrait-derived skin tones |
| `scripts/probes/` | one-off investigations kept for reference |

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness + generator fingerprint (browser cache key) |
| GET | `/api/draft/years` | draft years present locally |
| GET | `/api/draft/:year/generated?league&mode&gameVersion` | generated class preview (rows, likeness, dropped, degraded) |
| POST | `/api/draft/custom` | All-Time / decade classes and modifiers (strength, studs, generational, hindsight, autoStrength, variant) |
| POST | `/api/draft/recompute` | Madden's recomputed overall (+ re-solved attributes) for an edited prospect |
| POST | `/api/export/mdc` | build the `.mdc` (download, or `saveToSaves: true`) |
| POST | `/api/export/portraits/:year` | Frosty custom-portrait folder from real photos |
| GET | `/api/lookups/:name`, `/api/lookups/generic-heads?gameVersion` | lookups; per-game generic heads |
| GET/POST | `/api/franchise/*` | list, cap-reset, player-edit, players, roster-apply, teams, trait-realism, trim-free-agents, reset-draft-picks, schedule, relocate-rebrand, advance-roster — all take `gameVersion` |
| GET | `/api/gear/players?q=` | real players' extracted loadouts ("copy look") |

## Architecture

```
server/
  src/
    app.ts / server.ts        # express app (async errors -> 500), localhost bind, warm-up
    vendor/draft-class/       # M26Parser/Writer, M27Parser/Writer (see README there)
    services/
      PlayerLookupService     # CSV load, dedup, AFL reconstruction, photo-URL sanitising
      DraftEnrichment         # positions (FrontSevenService, depth charts), combine, skin tone
      RatingService           # wAV -> caliber; slot expectation
      DraftClassBuilder       # ranking (hindsight/strength), builds, faces, gear, M27 fields
      AttributeModel          # calibrated attribute generation + exact OVR reconcile
      CalibrationService      # per-game calibration (madden-calibration[-m27].json)
      EraBioService / HometownService / EraGearService / LikenessService / PersonaService
      FranchiseService        # madden-franchise tools, version-aware, verified writes
    routes/                   # health, lookups, draft, export, media, portrait, players, franchise, gear
  data/lookups/               # calibration, schemes, field stats, head catalogs, UDFA careers, ...
  data/Templates/             # CAREERDRAFT-2026Template, CAREERDRAFT-2027Template
  scripts/                    # build/verify/refresh scripts (+ probes/)
web/                          # React (Vite + TS + Tailwind): board, profile editor, franchise tools
```

### Key gotchas
- M26 `.mdc` uses the **4296-byte / offset-based** block model (`M26Parser`/`M26Writer`); the
  legacy 4322-byte parser was removed.
- M27: the header U16 at `0x42` is the prospect count and the game honours it; `0x94` is the
  portrait PID, `0x9e` the announcer surname id. See `M27-PORT.md`.
- Madden recomputes a prospect's overall from the attributes on import; the OVR byte is ignored.
  The builder reconciles the skill attributes so the recompute lands exactly.
