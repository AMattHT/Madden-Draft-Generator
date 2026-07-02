/**
 * Smoke test: prove the vendored .mdc engine reads and round-trips the
 * CAREERDRAFT-2026Template in plain Node (no Electron). This is the foundation
 * — if this fails, nothing downstream can export a valid draft class.
 *
 * IMPORTANT: M26 uses the 4296-byte / offset-based block model (M26Parser +
 * M26Writer). Do NOT use DraftClassParser.readDraftClass / index.js for M26 —
 * that path uses the legacy 4322-byte madden-draft-class-tools layout and
 * drifts into garbage after block 0.
 *
 * Run: npm run smoke:mdc
 */
const path = require('path');
const fs = require('fs');

const LIB = path.join(__dirname, '..', 'src', 'vendor', 'draft-class');
const { parseM26Prospects } = require(path.join(LIB, 'M26Parser'));
const { writeM26DraftClass } = require(path.join(LIB, 'M26Writer'));

const templatePath = path.join(__dirname, '..', 'data', 'Templates', 'CAREERDRAFT-2026Template');
const BLOCK_SIZE = 4296;
const DATA_START = 0x46;

function silence(fn) {
  const c = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = console.error = console.warn = console.info = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, c);
  }
}

function main() {
  const buf = fs.readFileSync(templatePath);
  const capacity = Math.floor((buf.length - DATA_START) / BLOCK_SIZE);
  console.log(`[smoke] template: ${templatePath}`);
  console.log(`[smoke] size: ${buf.length} bytes | physical block capacity: ${capacity}`);

  const prospects = silence(() => parseM26Prospects(buf, { dataStartOffset: DATA_START }));
  console.log(`[smoke] parsed prospects: ${prospects.length}`);
  const sample = prospects.slice(0, 5).map((p, i) => ({
    block: i,
    name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
    pos: p.position,
    ovr: p.overall,
    rnd: p.draftRound,
    pick: p.draftPick,
  }));
  console.log('[smoke] first 5:', JSON.stringify(sample));

  const named = prospects.filter((p) => (p.firstName || '').trim().length > 0).length;
  const posOk = prospects.filter((p) => p.position >= 0 && p.position <= 21).length;
  console.log(`[smoke] named: ${named}/${prospects.length} | position in [0,21]: ${posOk}/${prospects.length}`);

  // Round-trip: write parsed prospects back into a copy of the template, re-parse.
  const out = silence(() => writeM26DraftClass(buf, prospects, { dataStartOffset: DATA_START }));
  const reparsed = silence(() => parseM26Prospects(out, { dataStartOffset: DATA_START }));

  const sig = out.toString('ascii', 0, 8);
  // Verify the first 20 prospects survive the round-trip unchanged.
  let mismatches = 0;
  for (let i = 0; i < 20; i++) {
    const a = prospects[i];
    const b = reparsed[i];
    if (a.firstName !== b.firstName || a.lastName !== b.lastName || a.overall !== b.overall || a.position !== b.position) {
      mismatches++;
    }
  }

  console.log(`[smoke] output size: ${out.length} (==input: ${out.length === buf.length}) | sig: ${sig}`);
  console.log(`[smoke] reparsed: ${reparsed.length} | first-20 round-trip mismatches: ${mismatches}`);

  const ok =
    sig === 'FBCHUNKS' &&
    out.length === buf.length &&
    reparsed.length === prospects.length &&
    named === prospects.length &&
    posOk === prospects.length &&
    mismatches === 0;
  console.log(`\n[smoke] RESULT: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);
  process.exit(ok ? 0 : 1);
}

main();
