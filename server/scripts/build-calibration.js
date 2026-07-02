/**
 * Build data/lookups/madden-calibration.json from real Madden-generated draft
 * classes: the class-wide OVR curve (101 percentile points), dev-trait rates,
 * age distribution, and per-position attribute + height/weight norms. Our
 * generator uses this to match Madden's statistical shape. Run after dropping
 * new CAREERDRAFT-* files in the Saves dir (edit `files` below if needed).
 */
require('tsx/cjs');
const fs = require('fs');
const path = require('path');
const { MdcService } = require('../src/services/MdcService');
const { PositionMapper } = require('../src/services/PositionMapper');
const { RATING_KEYS } = require('../src/services/DraftClassBuilder');

const DIR = 'C:/Users/amatthews/Documents/Madden NFL 26/Saves';
const files = ['RANDOMGEN1', 'RANDOMGEN2', 'RANDOMGEN3', 'RANDOMGEN4', 'RANDOMGEN5'].map(
  (n) => `${DIR}/CAREERDRAFT-${n}`
);

const silence = (fn) => {
  const c = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = console.error = console.warn = console.info = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, c);
  }
};

const all = [];
let classCount = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const prospects = silence(() => MdcService.parse(fs.readFileSync(f))).filter(
    (p) => String(p.firstName || '').trim().length > 0
  );
  classCount++;
  for (const p of prospects) all.push(p);
}
if (all.length === 0) throw new Error('no prospects parsed — check the Saves dir paths');

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};

// ---- class-wide OVR curve: 101 percentile points ----
const ovrs = all.map((p) => Number(p.overall)).sort((a, b) => a - b);
const ovrCurve = [];
for (let p = 0; p <= 100; p++) ovrCurve.push(ovrs[Math.min(ovrs.length - 1, Math.floor((p / 100) * ovrs.length))]);

// ---- dev-trait rates ----
const devCounts = [0, 0, 0, 0];
for (const p of all) devCounts[Number(p.devTrait) || 0]++;
const devRates = devCounts.map((c) => c / all.length);

// ---- age distribution (20..24) ----
const ageWeights = {};
for (const p of all) {
  const a = Number(p.age);
  if (a >= 18 && a <= 30) ageWeights[a] = (ageWeights[a] || 0) + 1;
}

// ---- per-position profiles ----
const byPos = new Map();
for (const p of all) {
  const name = PositionMapper.name(Number(p.position));
  if (!byPos.has(name)) byPos.set(name, []);
  byPos.get(name).push(p);
}
const positions = {};
for (const [name, ps] of byPos) {
  const attrs = {};
  for (const k of RATING_KEYS) attrs[k] = Math.round(mean(ps.map((p) => Number(p[k]) || 0)));
  const archCounts = {};
  for (const p of ps) {
    const a = Number(p.archetype) || 0;
    archCounts[a] = (archCounts[a] || 0) + 1;
  }
  const archetypeMode = Number(Object.entries(archCounts).sort((a, b) => b[1] - a[1])[0][0]);
  // Per-archetype profiles (typical build + attributes) — used to assign each
  // player the archetype whose build matches theirs, the way Madden does.
  const byArch = {};
  for (const p of ps) {
    const a = Number(p.archetype) || 0;
    (byArch[a] ??= []).push(p);
  }
  const archetypeProfiles = {};
  for (const [aid, aps] of Object.entries(byArch)) {
    const aattrs = {};
    for (const k of RATING_KEYS) aattrs[k] = Math.round(mean(aps.map((p) => Number(p[k]) || 0)));
    archetypeProfiles[aid] = {
      count: aps.length,
      htMean: Math.round(mean(aps.map((p) => Number(p.heightInches)))),
      wtMean: Math.round(mean(aps.map((p) => Number(p.weight)))),
      ovrMean: Math.round(mean(aps.map((p) => Number(p.overall)))),
      attrs: aattrs,
    };
  }
  positions[name] = {
    count: ps.length,
    perClass: Math.round((ps.length / classCount) * 10) / 10,
    archetypeMode,
    archetypeDist: archCounts, // { archetypeId: count } — real Madden mix for this position
    archetypeProfiles, // { archetypeId: { htMean, wtMean, ovrMean, attrs } }
    ovrMean: Math.round(mean(ps.map((p) => Number(p.overall)))),
    htMean: Math.round(mean(ps.map((p) => Number(p.heightInches)))),
    htStd: Math.round(std(ps.map((p) => Number(p.heightInches))) * 10) / 10,
    wtMean: Math.round(mean(ps.map((p) => Number(p.weight)))),
    wtStd: Math.round(std(ps.map((p) => Number(p.weight)))),
    attrs,
  };
}

const out = {
  _source: `${classCount} Madden-generated draft classes (${all.length} prospects)`,
  builtFrom: files.map((f) => f.split(/[\\/]/).pop()),
  ovrCurve, // ovrCurve[p] = OVR at the p-th percentile (0..100)
  devRates, // [normal, star, superstar, xfactor] fractions
  ageWeights,
  positions,
};
const outPath = path.join(__dirname, '..', 'data', 'lookups', 'madden-calibration.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`OVR curve: p10=${ovrCurve[10]} p50=${ovrCurve[50]} p90=${ovrCurve[90]} p99=${ovrCurve[99]} p100=${ovrCurve[100]}`);
console.log(`Dev rates: ${devRates.map((r) => (r * 100).toFixed(1) + '%').join(' / ')}`);
console.log(`Positions profiled: ${Object.keys(positions).length}`);
