/**
 * M27 engine verification (no HTTP, no game):
 *  1. Parse the M27 template (a real M27-generated class) — sanity-check fields.
 *  2. Take our M26 2003 export, rewrite it as an M27 file via M27Writer, re-parse
 *     with M27Parser, and assert names/positions/OVR/dev/DNA round-trip and that
 *     unused blocks are zeroed.
 * Run: node scripts/verify-m27.js
 */
const path = require('path');
const fs = require('fs');

const M27Parser = require('../src/vendor/draft-class/M27Parser');
const M27Writer = require('../src/vendor/draft-class/M27Writer');
const M26Parser = require('../src/vendor/draft-class/M26Parser');

const quiet = { log: console.log, warn: console.warn, error: console.error };
function silence(fn) {
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { Object.assign(console, quiet); }
}

const DATA_START = 0x46;
const templatePath = path.join(__dirname, '..', 'data', 'Templates', 'CAREERDRAFT-2027Template');
const m26ExportPath = path.join(__dirname, '..', 'cache', 'exports', 'DraftClass_2003_NFL.mdc');

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

// ---------- 1. Parse the real M27 template ----------
console.log('[1] Parsing M27 template (real M27-generated class)…');
const template = fs.readFileSync(templatePath);
const tprospects = M27Parser.parseM27Prospects(template, { dataStartOffset: DATA_START });
const used = tprospects.filter((p) => p.firstName);
console.log(`  blocks: ${tprospects.length}, used: ${used.length}`);
for (const p of used.slice(0, 5)) {
  console.log(
    `  #${p.index} ${p.firstName} ${p.lastName} pos=${p.position} ovr=${p.overall} dev=${p.devTrait} ` +
    `age=${p.age} hgt=${p.heightInches} wgt=${p.weight} dna=[${(p.personaDNA || []).join(',')}]`
  );
}
check('455 blocks', tprospects.length === 455, String(tprospects.length));
check('used blocks in 220–455 range', used.length > 220 && used.length <= 455, String(used.length));
check('ages plausible (19-30)', used.every((p) => p.age >= 19 && p.age <= 30));
check('OVRs plausible (30-99)', used.every((p) => p.overall >= 30 && p.overall <= 99));
check('positions in 0-21', used.every((p) => p.position >= 0 && p.position <= 21));
const qbs = used.filter((p) => p.position === 0);
check('QBs found', qbs.length >= 8, String(qbs.length));
check('QB throwPower reads (50-99)', qbs.every((p) => p.throwPower >= 50 && p.throwPower <= 99),
  qbs.slice(0, 3).map((q) => q.throwPower).join(','));
check('persona DNA present on used blocks', used.every((p) => (p.personaDNA || []).length > 0));

// ---------- 2. Round-trip: our M26 2003 class -> M27 file ----------
console.log('[2] Round-tripping our 2003 class through M27Writer…');
const m26buf = fs.readFileSync(m26ExportPath);
const m26prospects = silence(() => M26Parser.parseM26Prospects(m26buf, { dataStartOffset: DATA_START }));
const named = m26prospects.filter((p) => (p.firstName || '').trim().length > 0);
console.log(`  source M26 class: ${named.length} prospects`);

// Assign test persona DNA: top picks get Confident(18)+Leader(38); everyone else one seeded trait.
const DNA_POOL = [1, 6, 7, 9, 18, 19, 23, 25, 30, 32, 38, 39];
const out = named.map((p, i) => ({
  ...p,
  personaDNA: i < 3 ? [18, 38] : [DNA_POOL[i % DNA_POOL.length]],
}));

const written = silence(() => M27Writer.writeM27DraftClass(template, out, { dataStartOffset: DATA_START }));
check('output size matches template', written.length === template.length, `${written.length} vs ${template.length}`);

const reparsed = M27Parser.parseM27Prospects(written, { dataStartOffset: DATA_START });
const rused = reparsed.filter((p) => p.firstName);
check('same used count', rused.length === named.length, `${rused.length} vs ${named.length}`);

let nameOk = 0, posOk = 0, ovrOk = 0, devOk = 0, dnaOk = 0, faceOk = 0;
for (let i = 0; i < named.length; i++) {
  const a = named[i], b = reparsed[i];
  if (a.firstName === b.firstName && a.lastName === b.lastName) nameOk++;
  if (a.position === b.position) posOk++;
  if (a.overall === b.overall) ovrOk++;
  if ((a.devTrait || 0) === b.devTrait) devOk++;
  if (JSON.stringify(out[i].personaDNA) === JSON.stringify(b.personaDNA)) dnaOk++;
  const wantFace = a.PEPS || a.visuals?.genericHeadName || '';
  const gotFace = b.PEPS || b.visuals?.genericHeadName || '';
  if (wantFace === gotFace) faceOk++;
}
check('names round-trip', nameOk === named.length, `${nameOk}/${named.length}`);
check('positions round-trip', posOk === named.length, `${posOk}/${named.length}`);
check('OVRs round-trip', ovrOk === named.length, `${ovrOk}/${named.length}`);
check('dev traits round-trip', devOk === named.length, `${devOk}/${named.length}`);
check('persona DNA round-trips', dnaOk === named.length, `${dnaOk}/${named.length}`);
check('face assets round-trip', faceOk === named.length, `${faceOk}/${named.length}`);

// spot-check ratings fidelity on first prospect
const a0 = named[0], b0 = reparsed[0];
const ratingKeys = Object.keys(M27Parser.M27_RATINGS);
const mismatches = ratingKeys.filter((k) => (a0[k] || 0) !== (b0[k] || 0));
check('all 54 ratings round-trip (pick 1)', mismatches.length === 0, mismatches.join(',') || 'exact');

// unused blocks fully zeroed
const unusedZero = (() => {
  for (let i = named.length; i < reparsed.length; i++) {
    const bs = DATA_START + i * M27Parser.M27_BLOCK_SIZE;
    for (let j = bs; j < bs + M27Parser.M27_BLOCK_SIZE; j++) if (written[j] !== 0) return false;
  }
  return true;
})();
check('unused blocks zeroed', unusedZero);

// save the artifact for an in-game import test
const outPath = path.join(__dirname, '..', 'cache', 'exports', 'CAREERDRAFT-2003M27TEST');
fs.writeFileSync(outPath, written);
console.log(`  wrote ${outPath}`);

console.log(`\n[verify-m27] ${failures === 0 ? 'PASS ✅' : failures + ' FAILURES ❌'}`);
process.exit(failures === 0 ? 0 : 1);
