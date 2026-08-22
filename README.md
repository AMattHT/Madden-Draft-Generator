# Madden 26 NFL Draft Class Generator

Generate importable Madden 26 draft classes (`.mdc`) from real NFL draft history
(1936–2026), with player ratings derived from Pro-Football-Reference **weighted
Approximate Value (wAV)**. AFL+NFL drafts are merged for 1960–1969, veteran free
agents can be injected, and players are cached.

This is a **React web app + local Node backend** (a pure browser app can't scrape
PFR through Cloudflare/CORS or write the `.mdc` binary — that needs Node). It
reuses the proven `.mdc` engine, rating logic, lookups, and template from the
sibling **Madden Editor Suite**.

## Status

| Area | State |
|------|-------|
| `.mdc` read/write engine (vendored, plain Node) | ✅ working, round-trip verified |
| Backend skeleton: Express + SQLite cache + lookups | ✅ working |
| Local-baseline draft classes 1936–2026 (offline) | ✅ working (`ALL_PLAYER_LOOKUP.csv`, 31,883 players) |
| AFL/NFL combined years (1960–69) | ✅ merged (dedup of dual-drafted players: TODO) |
| wAV → Overall + dev trait | ✅ first cut (per-position anchor tables) |
| Attribute spread | ✅ donor-based (template's real prospects as position donors, shifted to target OVR) — full reconciliation engine: TODO |
| `.mdc` export + asset linking (PID/PEPS/CommID) + 402 cap | ✅ working, verified |
| Player likeness (real face asset / portrait, else race-appropriate generic) | ✅ working — Bo Jackson → `jacksonBo_9877`, Namath → real portrait; no-data players (e.g. Ernie Davis) get a generic face |
| Era-appropriate gear (helmet/cleats/gloves/visor by year + position) | ✅ working — 1965 → Riddell TK, **no visor**, taped hands; 2003 → Revolution, Nike Diamond Turf |
| Era-typical extras (wrist tape/bands, elbow pads, towel + position, neck rolls, socks, sleeves, eye black) | ✅ working — per-era/position weighted pools; 1965 OL → max wrist tape + elbow pads + cowboy collar; 80s–90s skill → sweatbands + back towel |
| **Copy real player gear** (full loadout from the actual M26 roster) | ✅ working — `scripts/extract-real-gear.ts` pulls 2,998 real players' complete loadouts from a franchise save into `data/real-player-gear.json`; Equipment Builder has a "Copy look from a real player…" search (towel position, helmet/facemask, sleeves, pads — all slots) |
| Custom photo portraits via Frosty (real headshots for no-face players) | ✅ working — downloads Wiki/PFR photos, face-crops to PLPO-named PNGs + manifest for Frosty import; `.mdc` points each prospect at the recycled slot. 2,432 candidate players across 83 years |
| **React web app** (`web/`) — browse years, wAV-rated table, export, IndexedDB cache | ✅ working — run `npm run dev` from the project root (starts both), open `http://localhost:5173` |
| Madden-calibrated distributions (from real Madden random classes) | ✅ working — `madden-calibration.json` (OVR curve, dev rates 74/21/3.5/1.1, per-position attr/bio norms from 2,010 real prospects); our classes now match Madden's bell (mean ~66, max 84) with wAV ordering the top. Recalibrate: drop `CAREERDRAFT-*` files in the Saves dir, run `node scripts/build-calibration.js` |
| Rating modes: **Realistic** (Madden-capped 84) vs **Career** (retrospective, uncapped) | ✅ working — toggle in the class header; Career rates players by how good they actually turned out (2003: Kevin Williams 98, Polamalu 96) |
| Archetypes assigned by real build | ✅ working — heavy back → Power, lean back → Elusive/Receiving, big WR → Physical, lean end → Speed Rusher; ratings then match the archetype |
| Player profiles + attribute editing + real photos | ✅ working — click a player → slide-over with real photo (backend image proxy), bio, a position-aware **radar chart** of signature attributes (shows how elite they are; live-updates), and all 54 editable attributes (+ OVR / dev trait / position / **archetype** — sampled per-player from Madden's real per-position mix); edits persist in IndexedDB and apply to the `.mdc` export |
| Live PFR/Wikipedia/nflverse scraping + dedup | ⏳ TODO (Task 3) |
| wAV reconciliation via OVRWeightsCalculator | ⏳ TODO (Task 4) |
| Free-agent injection | ⏳ TODO (Task 5) |
| React frontend | ⏳ TODO (Task 6) |

Full plan: `C:\Users\amatthews\.claude\plans\i-am-wanting-to-proud-puppy.md`.

## Run

You can now start **both the backend and frontend with a single command** from the project root:

```bash
npm run dev
```

This uses `concurrently` to run:

- `npm run dev:server` → backend (tsx watch) 
- `npm run dev:web` → Vite frontend 

Colored output with prefixes (SERVER / WEB) is provided automatically.

You can also control them individually:

```bash
npm run dev:server
npm run dev:web
```

### First time / one-time setup

```bash
# Install root tools (concurrently)
npm install

# Install dependencies for each package (one time)
cd server && npm install
cd ../web && npm install
cd ..
```

The web UI will be at **http://localhost:5173**.
The API will be at **http://localhost:5174**.

### Verify the engine and export (no server needed)

```bash
npm run smoke:mdc                 # round-trip the template through the .mdc engine
node scripts/verify-export.js 2003   # build + write a real .mdc for a year, re-parse, assert
node scripts/verify-export.js 1965   # AFL/NFL combined
```

Generated files land in `server/cache/exports/`. Import in Madden 26:
**Franchise → Choose Draft Class → Import Local File**.

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | liveness |
| GET | `/api/template/info` | engine + template sanity |
| GET | `/api/lookups` / `/api/lookups/:name` | `position`, `college`, `state`, `archetype`, or `*.json` |
| GET | `/api/draft/years` | all draft years present locally |
| GET | `/api/draft/:year?league=NFL\|AFL\|combined` | baseline draft class |
| GET | `/api/gear/players?q=` / `/api/gear/players/:id` | search real NFL players' extracted loadouts / fetch one full loadout |
| POST | `/api/export/mdc` `{ year, league }` | download a generated `.mdc` |
| POST | `/api/export/portraits/:year` `?league&limit` | build a Frosty custom-portrait folder (downloads real photos) |

## Architecture

```
server/
  src/
    vendor/draft-class/   # vendored M26Parser/M26Writer (.mdc) — 4296/offset model
    services/             # MdcService, LookupService, PlayerLookupService,
                          # PositionMapper, RatingService, DraftClassBuilder
    routes/               # health, lookups, draft, export
    db/                   # better-sqlite3 cache (schema.sql)
    config/paths.ts
  data/                   # lookups, formulas, CAREERDRAFT-2026Template (copied from Editor Suite)
  scripts/                # smoke-mdc, probe-m26parser, verify-export
web/                      # React app (Vite+TS+Tailwind): browse years, wAV ratings, export .mdc, IndexedDB cache
```

### Key gotcha
M26 `.mdc` uses the **4296-byte / offset-based** block model — use
`M26Parser`/`M26Writer`, NOT the legacy 4322-byte `DraftClassParser`. See the
`mdc-m26-format-gotcha` note.
