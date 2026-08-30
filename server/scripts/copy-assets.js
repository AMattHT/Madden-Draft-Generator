/**
 * Build helper: copy non-TS assets the compiled server needs into dist/.
 * (tsc only emits .ts -> .js; the vendored .js engine and schema.sql are not
 * compiled and must be copied. `data/` is found at the server root at runtime.)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const copies = [
  ['src/vendor', 'dist/vendor'],
  ['src/db/schema.sql', 'dist/db/schema.sql'],
  // The What's new panel reads this at runtime. Copied rather than committed to
  // data/ so there is one source of truth at the repo root, not two that drift.
  ['../CHANGELOG.md', 'data/CHANGELOG.md'],
];

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

for (const [from, to] of copies) {
  const src = path.join(root, from);
  const dst = path.join(root, to);
  if (fs.existsSync(src)) {
    copyRecursive(src, dst);
    console.log(`[copy-assets] ${from} -> ${to}`);
  } else {
    console.warn(`[copy-assets] missing: ${from}`);
  }
}
