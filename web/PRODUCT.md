# Product

## Register

product

## Users

A single power user: a Madden 26 franchise player and modder (technically fluent,
comfortable with tools and data). Their context is a focused desktop session —
pulling up a real NFL draft year, reading the generated class as rated prospects,
tweaking a few players, and exporting a `.mdc` to import into Madden. They already
know football and Madden; they want the tool to be fast, legible, and trustworthy,
not to teach them the domain.

## Product Purpose

Generate importable Madden 26 draft classes from real NFL draft history (1936–2026),
with player ratings derived from Pro-Football-Reference weighted Approximate Value
(wAV). The user browses any draft year, sees the class as a rating-ranked table,
inspects and edits individual prospects (overall, position, dev trait, archetype,
54 attributes), and exports a `.mdc`. Two rating lenses: **Realistic** (Madden-
calibrated, capped at 84, like a class the game itself would roll) and **Career**
(retrospective — rated by how good the player actually turned out, uncapped).

Success: a class that feels indistinguishable from one Madden generated — same bell
curve, same dev-trait mix — but ordered by real football outcomes, exported and
imported into a franchise without a hitch.

## Brand Personality

Broadcast-grade scouting war-room. Authoritative, kinetic, precise. It should feel
like NFL Draft broadcast graphics and a pro personnel department's board — dense,
confident, built for someone reading fast — not like a generic admin panel. Voice
is terse and factual: numbers, tiers, provenance. No hand-holding, no marketing gloss.

## Anti-references

- Generic SaaS dashboards: the hero-metric template (big number + label + gradient),
  identical card grids, Bootstrap admin chrome.
- The flat, gray, undifferentiated "AI dark theme" where every surface is the same
  charcoal and nothing signals hierarchy.
- A bare spreadsheet — density is good, but the class is a scouting board, not a grid
  of undifferentiated cells.
- EA's own cluttered in-game menus.

## Design Principles

- **Data is the product; chrome frames it.** The prospect table and its ratings are
  the point. Every other element exists to make them faster to read, never to compete.
- **Scannable in one vertical pass.** OVR, position, dev trait, and wAV tier must read
  at a glance down the board — color-coded but always backed by the number.
- **Every number shows its provenance.** Cache vs. live, wAV actual vs. predicted,
  edited vs. generated, Realistic vs. Career — state is always visible, never guessed.
- **Direct manipulation.** Click a prospect, edit in place, see it reflected in the
  board and the export immediately. No save-dialog ceremony.
- **Broadcast energy, restrained.** Motion and color signal state and hierarchy
  (selection, tier, live-vs-cache), never decorate. 150–250ms, state-conveying only.

## Accessibility & Inclusion

- Dark theme, WCAG AA: body text ≥4.5:1 against its surface; the muted-gray-on-charcoal
  trap is out. Bump muted labels toward the ink end when contrast is close.
- Tier semantics (wAV, OVR, dev) are always paired with a number or text label —
  never color alone — so the board survives color-blindness and grayscale.
- Respect `prefers-reduced-motion`: every transition has a crossfade/instant fallback.
- Full keyboard reach for the year selector, toolbar, table rows, and profile editor.
