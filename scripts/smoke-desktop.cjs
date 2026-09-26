// Run after pack:m26 / pack:m27. Pass an installed Playwright package path.
// Uses temporary user data and disables automatic update downloads. No saves
// are written; roster checks use the read-only generation preview endpoint.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8')).version;

(async () => {
  for (const game of ['m26', 'm27']) {
    const exe = path.join(root, 'desktop/release', game, 'win-unpacked', `Madden ${game.slice(1)} Draft Class Generator.exe`);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), `draft-${game}-smoke-`));
    const env = { ...process.env, PORTABLE_EXECUTABLE_DIR: path.dirname(exe) };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.DRAFT_TOOL_FRANCHISE;
    let app;
    const errors = [];
    try {
      app = await _electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`], env, timeout: 60000 });
      const page = await app.firstWindow();
      page.on('pageerror', e => errors.push(e.message));
      page.setDefaultTimeout(30000);
      await page.waitForURL(/http:\/\/127\.0\.0\.1/);
      const base = new URL(page.url()).origin;
      async function json(route, options) {
        const r = await page.request.fetch(base + route, options);
        assert.equal(r.ok(), true, `${route}: ${r.status()}`);
        return r.json();
      }
      assert.equal((await json('/api/health')).ok, true);
      assert.deepEqual(await json('/api/config'), { gameVersion: game, franchise: false });
      const about = await json('/api/about');
      assert.equal(about.version, version);
      assert.ok(about.changelog.includes(`## ${version}`));
      assert.equal(await page.getByTitle('Franchise tools', { exact: true }).count(), 0);
      await page.getByRole('button', { name: /^Draft / }).click();
      await page.getByPlaceholder('Jump to year…').fill('2003');
      await page.getByPlaceholder('Jump to year…').press('Enter');
      await page.getByText('Carson Palmer', { exact: true }).first().waitFor({ timeout: 60000 });
      await page.getByText('Carson Palmer', { exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Carson Palmer profile' });
      await dialog.waitFor();
      await dialog.evaluate(el => Promise.all(el.parentElement.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
      const geometry = await dialog.evaluate(el => {
        const r = el.parentElement.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, viewportWidth: innerWidth, viewportHeight: innerHeight, aboveToolbar: el.parentElement.contains(document.elementFromPoint(20, 20)) };
      });
      console.log(`${game} profile geometry:`, geometry);
      // Windows display scaling can leave fractional CSS pixels in DOMRect;
      // innerWidth/innerHeight are rounded integers.
      assert.equal(geometry.x, 0);
      assert.equal(geometry.y, 0);
      assert.ok(Math.abs(geometry.width - geometry.viewportWidth) < 1);
      assert.ok(Math.abs(geometry.height - geometry.viewportHeight) < 1);
      assert.equal(geometry.aboveToolbar, true, 'profile covers the packaged toolbar');
      for (const name of ['Ratings', 'Bio', 'Appearance', 'Equipment', 'Scouting']) {
        await dialog.getByRole('button', { name, exact: true }).click();
      }
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Help', exact: true }).click();
      await page.getByRole('menuitem', { name: 'What\'s new…' }).click();
      await page.getByText(`Version ${version}`, { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      if (game === 'm27') {
        for (const [key, pid] of [['2008|NFL|joe|flacco|18', 1115], ['1996|NFL|ray|lewis|26', 1902], ['2002|NFL|ed|reed|24', 2501]]) {
          const player = await json('/api/roster/preview-add', { method: 'POST', data: { key } });
          assert.equal(player.portraitPid, pid);
        }
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${game}: packaged v${version} startup, native backend, game pin, franchise gate, class generation, profile layers/tabs, release notes${game === 'm27' ? ', roster portraits' : ''}.`);
    } finally {
      await app?.close();
      // Keep the unique temporary profile for diagnostics; never touch the
      // installed app's user-data directory or the user's Madden saves.
      console.log(`Smoke profile: ${profile}`);
    }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
