/**
 * Check our OVR recompute (OVRWeightsCalculator) against the overall the game
 * itself wrote in its generated classes, per (position, archetype). Where the
 * formula is systematically off, fit DesiredLow/DesiredHigh from the data
 * (OVR = 99 * (weightedAvg - DL) / (DH - DL) is linear in weightedAvg) and write
 * data/lookups/ovrweights-overrides.json, which OVRWeightsCalculator applies.
 *
 *   node scripts/fit-ovrweights.js [m26|m27]
 */
require('tsx/cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MdcService } = require('../src/services/MdcService');
const { Mdc27Service } = require('../src/services/Mdc27Service');
const { OVRWeightsCalculator } = require('../src/services/OVRWeightsCalculator');
const { LookupService } = require('../src/services/LookupService');
const { PositionMapper } = require('../src/services/PositionMapper');

const version = (process.argv[2] || 'm26').toLowerCase();
const home = process.env.USERPROFILE || os.homedir();
const dir = version === 'm27' ? `${home}/Documents/Madden NFL 27/saves` : `${home}/Documents/Madden NFL 26/Saves`;
const names = version === 'm27' ? ['TEST1', 'TEST2', 'TEST3', 'TESTSUPERSTRONG'] : ['RANDOMGEN1', 'RANDOMGEN2', 'RANDOMGEN3', 'RANDOMGEN4', 'RANDOMGEN5'];
const silence = (fn) => { const c = { ...console }; console.log = console.error = console.warn = console.info = () => {}; try { return fn(); } finally { Object.assign(console, c); } };

const groups = new Map(); // key pos:arch -> { xs: weightedAvg[], ys: ovr[] }
let total = 0, exact = 0, within1 = 0;
for (const n of names) {
  const f = path.join(dir, `CAREERDRAFT-${n}`);
  if (!fs.existsSync(f)) continue;
  const ps = silence(() => (version === 'm27' ? Mdc27Service.parse : MdcService.parse).call(version === 'm27' ? Mdc27Service : MdcService, fs.readFileSync(f))).filter((p) => p.firstName);
  for (const p of ps) {
    const posId = Number(p.position), arch = Number(p.archetype) || 0, ovr = Number(p.overall);
    const entry = OVRWeightsCalculator.ovrEntryFor(posId, arch);
    if (!entry || !entry.sumWeight) continue;
    let sum = 0;
    for (const [a, w] of Object.entries(entry.weights)) sum += (Number(p[a]) || 0) * w;
    const wavg = sum / entry.sumWeight;
    const got = OVRWeightsCalculator.computeOverall(posId, arch, p);
    total++; if (got === ovr) exact++; if (Math.abs(got - ovr) <= 1) within1++;
    const key = `${posId}:${arch}`;
    const g = groups.get(key) ?? { posId, arch, xs: [], ys: [], miss: 0, n: 0, entry };
    g.xs.push(wavg); g.ys.push(ovr); g.n++; if (got !== ovr) g.miss++;
    groups.set(key, g);
  }
}
console.log(`${version}: ${total} prospects, exact ${exact} (${((exact / total) * 100).toFixed(1)}%), within 1: ${within1}`);

const overrides = {};
for (const g of groups.values()) {
  if (g.n < 8 || g.miss / g.n < 0.25) continue;
  // least squares OVR = a*wavg + b
  const n = g.n, mx = g.xs.reduce((s, x) => s + x, 0) / n, my = g.ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (g.xs[i] - mx) * (g.ys[i] - my); sxx += (g.xs[i] - mx) ** 2; }
  if (!sxx) continue;
  const a = sxy / sxx, b = my - a * mx;
  const DL = -b / a, DH = DL + 99 / a;
  // verify the fit
  let fitExact = 0;
  for (let i = 0; i < n; i++) if (Math.round(((g.xs[i] - DL) / (DH - DL)) * 99) === g.ys[i]) fitExact++;
  const posName = PositionMapper.name(g.posId), archName = LookupService.idToName('archetype', g.arch) || `#${g.arch}`;
  console.log(`  ${posName.padEnd(5)} ${archName.padEnd(22)} n=${String(g.n).padStart(3)} miss ${String(g.miss).padStart(3)} | stored DL/DH ${g.entry.desiredLow}/${g.entry.desiredHigh} -> fit ${DL.toFixed(2)}/${DH.toFixed(2)} (fit exact ${fitExact}/${n})`);
  if (fitExact > g.n - g.miss) overrides[`${g.posId}:${g.arch}`] = { pos: posName, archetype: archName, desiredLow: +DL.toFixed(3), desiredHigh: +DH.toFixed(3), n: g.n, fitExact };
}
const out = path.join(__dirname, '..', 'data', 'lookups', version === 'm27' ? 'ovrweights-overrides-m27.json' : 'ovrweights-overrides.json');
fs.writeFileSync(out, JSON.stringify({ _source: `fit from ${total} game-generated ${version} prospects`, overrides }, null, 1));
console.log(`wrote ${out} (${Object.keys(overrides).length} overrides)`);
