# Madden Draft Class Generator — 1.0.0

First public release. Two standalone Windows apps, one per game:

| App | Writes | Download |
|---|---|---|
| **Madden 26 Draft Class Generator** | M26 `.mdc` (4296-byte format) | `Madden 26 Draft Class Generator Setup 1.0.0.exe` (installer) or the portable exe |
| **Madden 27 Draft Class Generator** | M27 `.mdc` (5876-byte format + persona DNA) | `Madden 27 Draft Class Generator Setup 1.0.0.exe` (installer) or the portable exe |

Each app is locked to its game — install the one that matches your Madden.

## What it does

- Builds importable draft classes for **every real NFL draft 1936–2026** (AFL+NFL merged 1960–66),
  rated from Pro-Football-Reference career **wAV** and calibrated against the game's own generated
  classes — the overall Madden shows on import equals the one written.
- **Realistic** lens (rookie-scaled, hindsight slider, auto class strength) or **Career** lens
  (rated by how they actually turned out).
- Real face scans and portraits where the game can render them, era-correct generic heads, builds,
  gear, and (M27) persona DNA. Player photos on the board: curated shots, ESPN/NFL headshots, and
  Wikipedia photos, falling back to the in-game menu portrait.
- Full per-player editor: ratings, positions, bio, face, gear, persona — with undo/redo, edit
  export/import, and class variants.
- **Export → Save to Madden Saves** writes `CAREERDRAFT-*` straight into the game's Saves folder
  (atomic, keeps a `.bak`). In Madden: Franchise → Choose Draft Class.

## First run

The app downloads the nflverse datasets (~180 MB) into `%APPDATA%\<app name>\cache` and builds its
position caches — give it a few minutes on first launch. Everything after that is local.

## Not in this release

- **Franchise Tools** (cap reset, roster editor, advance seasons, relocation) are disabled for 1.0.0
  while they mature. They remain in the codebase for development builds.

## Notes

- Windows SmartScreen may warn on first run (the exes are unsigned). "More info → Run anyway".
- The two apps keep separate caches; installing both means two data downloads.
