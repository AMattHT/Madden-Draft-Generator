/**
 * Probe: parse the template with the AUTHORITATIVE M26 parser (4296/offset model)
 * and confirm multiple consecutive blocks come out clean (no drift), unlike the
 * legacy 4322 DraftClassParser path.
 */
const path = require('path');
const fs = require('fs');

const LIB = path.join(__dirname, '..', 'src', 'vendor', 'draft-class');
const { parseM26Prospects } = require(path.join(LIB, 'M26Parser'));

const templatePath = path.join(__dirname, '..', 'data', 'Templates', 'CAREERDRAFT-2026Template');

function withSilencedConsole(fn) {
  const { log, error, warn, info } = console;
  console.log = console.error = console.warn = console.info = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, { log, error, warn, info });
  }
}

const buf = fs.readFileSync(templatePath);
const BLOCK_SIZE = 4296;
const dataStartOffset = 0x46;
const capacity = Math.floor((buf.length - dataStartOffset) / BLOCK_SIZE);
console.log(`[probe] file size: ${buf.length}, dataStartOffset: ${dataStartOffset}`);
console.log(`[probe] physical block capacity: ${capacity}`);

const prospects = withSilencedConsole(() =>
  parseM26Prospects(buf, { dataStartOffset })
);
console.log(`[probe] M26Parser returned: ${prospects.length} prospects`);

const named = prospects.filter((p) => (p.firstName || '').trim().length > 0);
console.log(`[probe] prospects with a firstName: ${named.length}`);

// Show first 12 blocks: are positions all in range 0..21? are OVRs sane?
const rows = prospects.slice(0, 12).map((p, i) => ({
  i,
  name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
  pos: p.position,
  posOk: p.position >= 0 && p.position <= 21,
  ovr: p.overall,
  rnd: p.draftRound,
  pick: p.draftPick,
  draftable: p.draftable,
}));
console.log('[probe] first 12 blocks:');
for (const r of rows) console.log('  ', JSON.stringify(r));

const firstN = prospects.slice(0, Math.min(264, prospects.length));
const posInRange = firstN.filter((p) => p.position >= 0 && p.position <= 21).length;
console.log(`[probe] of first ${firstN.length} blocks, ${posInRange} have position in [0,21]`);
