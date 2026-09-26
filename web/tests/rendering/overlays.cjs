const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const webRoot = path.resolve(__dirname, '../..');
(async () => {
  const { createServer } = await import(pathToFileURL(path.join(webRoot, 'node_modules/vite/dist/node/index.js')));
  const server = await createServer({ root: webRoot, server: { port: 5187, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/api/**', route => route.fulfill({ status: 503, body: '{}' }));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5187/tests/rendering/overlays.html');
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(400);
    const geometry = await page.getByRole('dialog').evaluate(el => {
      const overlay = el.parentElement;
      const r = overlay.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, aboveToolbar: overlay.contains(document.elementFromPoint(20, 20)), blur: getComputedStyle(overlay).backdropFilter };
    });
    console.log('Drawer:', geometry);
    assert.deepEqual(geometry, { x: 0, y: 0, width: 1440, height: 1000, aboveToolbar: true, blur: 'none' });
    for (let pass = 0; pass < 3; pass++) {
      for (const name of ['Scouting', 'Ratings', 'Bio', 'Appearance', 'Equipment', 'Attributes']) {
        await page.getByRole('button', { name, exact: true }).click();
        assert.equal(await page.getByRole('dialog').evaluate(el => el.parentElement.contains(document.elementFromPoint(20, 20))), true);
      }
    }
    for (const name of ['Edit appearance', 'Edit equipment']) {
      await page.getByRole('button', { name, exact: true }).click();
      const nested = page.getByRole('dialog').last();
      await nested.waitFor();
      await page.waitForTimeout(250);
      assert.equal(await nested.evaluate(el => el.parentElement.contains(document.elementFromPoint(20, 20))), true);
      assert.equal(await nested.evaluate(el => getComputedStyle(el.parentElement).backdropFilter), 'none');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 1);
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: 'Open player' }).click();
    await page.getByRole('dialog').waitFor();
    await page.setViewportSize({ width: 800, height: 700 });
    const resized = await page.getByRole('dialog').evaluate(el => {
      const r = el.parentElement.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    assert.deepEqual(resized, { x: 0, y: 0, width: 800, height: 700 });
    await page.mouse.click(20, 200);
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('http://127.0.0.1:5187/tests/rendering/overlays.html?pane');
    const pane = page.getByRole('region');
    await pane.waitFor();
    assert.equal(await pane.evaluate(el => !!el.closest('main')), true);
    await page.getByRole('button', { name: 'Edit appearance', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole('dialog').evaluate(el => el.parentElement.contains(document.elementFromPoint(20, 20))), true);
    await page.keyboard.press('Escape');
    assert.equal(await pane.count(), 1);
    await page.goto('http://127.0.0.1:5187/tests/rendering/overlays.html?board');
    const board = page.getByTestId('board');
    for (const spoilers of [false, true]) {
      if (spoilers) await page.getByRole('button', { name: 'Toggle spoilers' }).click();
      await page.getByRole('button', { name: 'Clear filter' }).click();
      await board.locator(':scope > div').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await board.getByRole('button', { name: /Prospect 160 / }).waitFor();
      await page.getByRole('button', { name: 'Filter to one' }).click();
      await board.getByRole('button', { name: /Prospect 1 / }).click({ timeout: 5000 });
      assert.equal(await page.locator('output').textContent(), 'Selected: 1');
      await page.getByRole('button', { name: 'Filter to none' }).click();
      await board.getByText('No players match the current filter.').waitFor();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: viewport coverage, resize, tab navigation, nested overlays, dismissal, inline scout pane, scrolled board filtering; no runtime errors.');
  } finally { await browser?.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
