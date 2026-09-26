# v1.5.0 release validation

Validated locally on Windows on 2026-09-26.

## Scope

- Reviewed UI update, player/editor portals and removal of backdrop blur.
- Big board filtering after scrolling, including one-result and empty results.
- Madden 27 roster additions and face edits write the intended menu portrait ID;
  reopening a roster displays its stored ID.
- Full portrait-pack enumeration inventories image folders once per build.
- Existing announcer-name coverage and scouting prose changes are included.

Experimental franchise work remains disabled unless explicitly enabled with
`DRAFT_TOOL_FRANCHISE=1`. Both packaged apps are checked with that variable
absent: `/api/config` reports `franchise: false`, and navigation is hidden.
Local experiment/probe scripts are not bundled by the desktop build configs.

## Automated checks

| Check | Result |
| --- | --- |
| Server suite (`cd server; npm test`) | 366 passed, 0 failed, 0 skipped |
| Web suite (`cd web; npm test`) | 16 passed, 0 failed |
| Server TypeScript/build | Passed |
| Web TypeScript/build | Passed; existing bundle-size warning remains |
| Browser rendering regression | Passed |
| Final rebuilt Madden 26/27 desktop smoke | Both passed with version 1.5.0 |
| Windows installer and portable builds | Both games built successfully |
| Update manifests | Correct v1.5.0 paths, sizes and SHA-512 hashes; blockmaps present |
| Bundled release notes | Both packages contain the expanded 1.5.0 UI changelog |
| Independent review of fixes and release metadata | No actionable findings |
| `git diff --check` | Passed |

The browser regression uses actual components, not a static mockup. It checks
full-window coverage above the toolbar, resizing, repeated profile-tab changes,
nested appearance/equipment editors, Escape/backdrop dismissal, inline scout
pane behavior, and filtering a scrolled Big board with spoilers off and on.

Two tests previously assumed fixed values in a locally installed official
roster that changes with game updates. Exact values now use a synthetic encoded
fixture; installed-roster integration checks remain. The full-pack regression
also checks that a picture dropped in between builds is discovered immediately.

## Desktop smoke test

Run from the repository root after building the packaged applications:

```powershell
node scripts/smoke-desktop.cjs C:\path\to\node_modules\playwright
```

The harness launches each packaged executable with a unique temporary user-data
directory and automatic update downloads disabled. It verifies the native
backend starts, game pinning, version/changelog, the franchise gate, 2003 class
generation, profile coverage and tabs, release notes, and Madden 27 roster
portrait preview IDs. It does not write Madden saves or install an update.
Temporary profile paths are printed for diagnostics.

Local run logs are in `server/cache/release-150-tests.log` and
`server/cache/release-150-desktop-smoke.log` (ignored build/test output).
Installer and portable outputs are under `desktop/release/m26` and
`desktop/release/m27`; hashes are recorded in `desktop/release/v1.5.0-checksums.json`.

The browser-only regression can be rerun with:

```powershell
cd web
npm run test:rendering -- C:\path\to\node_modules\playwright
```

## Limits

The screenshot's overlapping-editor defect was reproduced and corrected.
Graphics-driver-specific rapid flickering still needs confirmation by an
affected reporter. Portrait IDs were checked in serialized roster bytes and
the packaged API; the corrected roster was not visually checked inside Madden.
Existing roster projects must be re-exported to apply the portrait correction
to their added players. Publication is separate from these local checks.
