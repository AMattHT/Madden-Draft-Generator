/**
 * Analyze real Madden-26-generated draft classes to calibrate our generator:
 * OVR curve, position mix, dev-trait rates, age/ht/wt, and per-position
 * attribute norms. Pass file paths as args (defaults to the 5 RANDOMGEN files).
 */
require('tsx/cjs');
const fs = require('fs');
const { MdcService } = require('../src/services/MdcService');
const { PositionMapper } = require('../src/services/PositionMapper');
const { RATING_KEYS } = require('../src/services/DraftClassBuilder');

const DIR = process.env.MADDEN_SAVES_DIR || require('path').join(require('os').homedir(), 'Documents', 'Madden NFL 26', 'Saves');
const files =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['RANDOMGEN1', 'RANDOMGEN2', 'RANDOMGEN3', 'RANDOMGEN4', 'RANDOMGEN5'].map((n) => `${DIR}/CAREERDRAFT-${n}`);

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
  if (!fs.existsSync(f)) {
    console.log(`MISSING: ${f}`);
    continue;
  }
  const buf = fs.readFileSync(f);
  const prospects = silence(() => MdcService.parse(buf)).filter((p) => String(p.firstName || '').trim().length > 0);
  classCount++;
  console.log(`${f.split(/[\\/]/).pop()}: ${prospects.length} named prospects`);
  for (const p of prospects) all.push(p);
}
console.log(`\nTotal: ${all.length} prospects across ${classCount} classes (avg ${Math.round(all.length / classCount)}/class)\n`);

const stats = (arr) => {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  const pct = (p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
  return {
    min: a[0],
    max: a[a.length - 1],
    mean: Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10,
    p50: pct(50),
    p90: pct(90),
    p99: pct(99),
  };
};

// ---- OVR ----
const ovrs = all.map((p) => Number(p.overall));
console.log('OVR:', JSON.stringify(stats(ovrs)));
const buckets = { '<60': 0, '60-64': 0, '65-69': 0, '70-74': 0, '75-79': 0, '80-84': 0, '85-89': 0, '90+': 0 };
for (const o of ovrs) {
  if (o < 60) buckets['<60']++;
  else if (o < 65) buckets['60-64']++;
  else if (o < 70) buckets['65-69']++;
  else if (o < 75) buckets['70-74']++;
  else if (o < 80) buckets['75-79']++;
  else if (o < 85) buckets['80-84']++;
  else if (o < 90) buckets['85-89']++;
  else buckets['90+']++;
}
console.log('OVR histogram:', JSON.stringify(buckets));
console.log(`OVR >= 85: ${ovrs.filter((o) => o >= 85).length}  |  >= 80: ${ovrs.filter((o) => o >= 80).length}\n`);

// ---- Dev traits ----
const dev = [0, 0, 0, 0];
for (const p of all) dev[Number(p.devTrait) || 0]++;
const DEV = ['Normal', 'Star', 'Superstar', 'X-Factor'];
console.log('Dev traits:', DEV.map((n, i) => `${n} ${((dev[i] / all.length) * 100).toFixed(1)}%`).join('  '));
console.log(`  per class: ${DEV.map((n, i) => `${n} ${(dev[i] / classCount).toFixed(1)}`).join('  ')}\n`);

// ---- Age / height / weight ----
console.log('Age:', JSON.stringify(stats(all.map((p) => Number(p.age)))));
console.log('Height(in):', JSON.stringify(stats(all.map((p) => Number(p.heightInches)))));
console.log('Weight(lb):', JSON.stringify(stats(all.map((p) => Number(p.weight)))), '\n');

// ---- Position distribution + per-position OVR/bio ----
const byPos = new Map();
for (const p of all) {
  const name = PositionMapper.name(Number(p.position));
  if (!byPos.has(name)) byPos.set(name, []);
  byPos.get(name).push(p);
}
console.log('Position mix (count total | avg/class | OVR mean/max | ht | wt):');
const rows = [...byPos.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [name, ps] of rows) {
  const o = ps.map((p) => Number(p.overall));
  const avgHt = Math.round(ps.reduce((s, p) => s + Number(p.heightInches), 0) / ps.length);
  const avgWt = Math.round(ps.reduce((s, p) => s + Number(p.weight), 0) / ps.length);
  console.log(
    `  ${name.padEnd(5)} ${String(ps.length).padStart(4)} | ${(ps.length / classCount).toFixed(1).padStart(4)} | ${stats(o).mean}/${stats(o).max} | ${Math.floor(avgHt / 12)}'${avgHt % 12}" | ${avgWt}`
  );
}

// ---- Per-position attribute means (write to JSON for use as templates) ----
const profiles = {};
for (const [name, ps] of byPos) {
  const prof = { count: ps.length, ovrMean: stats(ps.map((p) => Number(p.overall))).mean, attrs: {} };
  for (const k of RATING_KEYS) {
    const vals = ps.map((p) => Number(p[k])).filter((v) => Number.isFinite(v));
    prof.attrs[k] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }
  profiles[name] = prof;
}
const outPath = require('path').join(__dirname, '..', 'cache', 'madden-position-profiles.json');
fs.mkdirSync(require('path').dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(profiles, null, 2));
console.log(`\nWrote per-position attribute profiles -> ${outPath}`);
