/**
 * Publish both apps into ONE GitHub release.
 *
 * electron-builder's own publisher cannot be used for this. Both apps share a
 * repo and a version, so both target tag v<version> -- and electron-builder does
 * not find an existing *draft* release when it looks the tag up. Running the two
 * builds in sequence therefore produced TWO drafts on the same tag, with the
 * installers split across them. GitHub only allows one published release per
 * tag, so publishing either would have orphaned the other app's installers and
 * left its update channel pointing at a file nobody could download.
 *
 * So the builds run with `--publish never` and this uploads afterwards: find or
 * create the single draft, then push every artefact into it. Re-running replaces
 * assets rather than duplicating them, so a failed upload can just be retried.
 *
 * The release is left as a DRAFT on purpose. A draft is invisible to the public
 * and to electron-updater, so nothing ships until someone runs:
 *   gh release edit v<version> --repo <repo> --draft=false
 *
 * Uses the gh CLI for auth so no token has to be handled here.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_DIR = path.join(ROOT, 'desktop', 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8'));
const VERSION = pkg.version;
const TAG = `v${VERSION}`;

const REPO = (() => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'builder-m26.json'), 'utf8'));
  const p = (cfg.publish || [])[0] || {};
  if (!p.owner || !p.repo) throw new Error('builder-m26.json has no github publish target');
  return `${p.owner}/${p.repo}`;
})();

/** --dry-run reports what would happen and touches nothing. Uploading is a
 *  gigabyte a go, so the logic has to be checkable without paying that. */
const DRY = process.argv.includes('--dry-run');

const gh = (args, opts = {}) =>
  execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts }).trim();

/** The one draft for this tag, created if absent. Two drafts on a tag is the
 *  exact failure this script exists to prevent, so refuse to guess between them. */
function draftRelease() {
  const all = JSON.parse(gh(['api', `repos/${REPO}/releases`, '--paginate']));
  const mine = all.filter((r) => r.tag_name === TAG);
  const published = mine.find((r) => !r.draft);
  if (published) return published; // adding assets to an already-public release is fine
  if (mine.length > 1) {
    throw new Error(
      `${mine.length} draft releases already exist on ${TAG} (ids ${mine.map((r) => r.id).join(', ')}). ` +
        'Delete all but one before publishing.'
    );
  }
  if (mine.length === 1) {
    console.log(`  reusing draft ${mine[0].id} on ${TAG}`);
    return mine[0];
  }
  if (DRY) { console.log(`  would create a draft on ${TAG}`); return { id: 0, assets: [] }; }
  const created = JSON.parse(
    gh(['api', '--method', 'POST', `repos/${REPO}/releases`,
        '-f', `tag_name=${TAG}`, '-f', `name=${TAG}`, '-F', 'draft=true', '-F', 'prerelease=false'])
  );
  console.log(`  created draft ${created.id} on ${TAG}`);
  return created;
}

/** electron-builder publishes with spaces collapsed to hyphens; the .yml
 *  manifests reference that form, so uploads must match it exactly or the
 *  updater will 404 on a file that is sitting right there under another name. */
const assetName = (file) => path.basename(file).replace(/ /g, '-');

function artefacts() {
  const out = [];
  for (const app of ['m26', 'm27']) {
    const dir = path.join(RELEASE_DIR, app);
    if (!fs.existsSync(dir)) throw new Error(`missing build output: ${dir}`);
    for (const f of fs.readdirSync(dir)) {
      if (/\.(exe|blockmap)$/.test(f) || f === `${app}.yml`) out.push(path.join(dir, f));
    }
  }
  if (!out.some((f) => f.endsWith('.exe'))) throw new Error('no installers found — run the build first');
  return out;
}

const release = draftRelease();
const existing = new Map((release.assets || []).map((a) => [a.name, a.id]));

for (const file of artefacts()) {
  const name = assetName(file);
  const mb = (fs.statSync(file).size / 1048576).toFixed(1);
  if (DRY) {
    console.log(`  would upload ${name} (${mb} MB)${existing.has(name) ? ' — replacing' : ''}`);
    continue;
  }
  if (existing.has(name)) {
    gh(['api', '--method', 'DELETE', `repos/${REPO}/releases/assets/${existing.get(name)}`]);
  }
  gh([
    'api', '--method', 'POST',
    '-H', 'Content-Type: application/octet-stream',
    `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    '--input', file,
  ]);
  console.log(`  uploaded ${name} (${mb} MB)`);
}

// A manifest naming an asset that is not in the release is a silently broken
// update channel: the app sees a new version and then cannot fetch it.
const finalAssets = DRY
  ? new Set(artefacts().map(assetName))
  : new Set(JSON.parse(gh(['api', `repos/${REPO}/releases/${release.id}`])).assets.map((a) => a.name));
for (const app of ['m26', 'm27']) {
  const yml = path.join(RELEASE_DIR, app, `${app}.yml`);
  if (!fs.existsSync(yml)) continue;
  const wanted = /^path:\s*(.+)$/m.exec(fs.readFileSync(yml, 'utf8'))?.[1]?.trim();
  if (wanted && !finalAssets.has(wanted)) {
    throw new Error(`${app}.yml points at "${wanted}", which is not in the release`);
  }
  console.log(`  ${app}.yml -> ${wanted} ✓`);
}

console.log(`\ndraft ready: https://github.com/${REPO}/releases`);
console.log(`publish it with:\n  gh release edit ${TAG} --repo ${REPO} --draft=false`);
