# Overlay rendering regression

Run `npm run test:rendering` from `web` with Playwright available, or pass an
absolute path to an existing Playwright package:

```powershell
npm run test:rendering -- C:\path\to\node_modules\playwright
```

The check uses installed Microsoft Edge in headless mode and starts a temporary
Vite server on loopback port 5187. It mocks API requests; no backend or player
cache is needed. Browser and server are closed when the check finishes.

The fixture mounts the real player editor inside an animated, clipped container
below a toolbar. It verifies full viewport coverage and hit testing above the
toolbar, repeated section navigation, resize, nested appearance/equipment
editors, Escape/backdrop dismissal, and the inline scout pane. This reproduced
the trapped drawer before the portal fix. It does not reproduce every graphics
driver's flickering behavior; the reported desktop symptom still needs a check
on an affected machine.

The same browser run checks the real Big board after scrolling to the bottom
and filtering to one or zero players, with spoilers both off and on. The
single-result case crashed before the pinned-band lookup was clamped.
