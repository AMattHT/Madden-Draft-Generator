/** Dump the game-generated classes' prospects (attributes + overall + archetype) to
 *  cache/game-prospects-<version>.json for offline fitting (fit-ovrweights.py). */
require('tsx/cjs');
const fs = require('fs'), os = require('os'), path = require('path');
const { MdcService } = require('../src/services/MdcService');
const { Mdc27Service } = require('../src/services/Mdc27Service');
const { RATING_KEYS } = require('../src/services/AttributeModel');
const { PositionMapper } = require('../src/services/PositionMapper');
const { LookupService } = require('../src/services/LookupService');
const version = (process.argv[2] || 'm26').toLowerCase();
const home = process.env.USERPROFILE || os.homedir();
const dir = version === 'm27' ? `${home}/Documents/Madden NFL 27/saves` : `${home}/Documents/Madden NFL 26/Saves`;
const names = version === 'm27' ? ['TEST1', 'TEST2', 'TEST3', 'TESTSUPERSTRONG'] : ['RANDOMGEN1', 'RANDOMGEN2', 'RANDOMGEN3', 'RANDOMGEN4', 'RANDOMGEN5'];
const silence = (fn) => { const c = { ...console }; console.log = console.error = console.warn = console.info = () => {}; try { return fn(); } finally { Object.assign(console, c); } };
const out = [];
for (const n of names) {
  const f = path.join(dir, `CAREERDRAFT-${n}`);
  if (!fs.existsSync(f)) continue;
  const ps = silence(() => (version === 'm27' ? Mdc27Service.parse(fs.readFileSync(f)) : MdcService.parse(fs.readFileSync(f)))).filter((p) => p.firstName);
  for (const p of ps) {
    const row = { pos: PositionMapper.name(Number(p.position)), posId: Number(p.position), archetype: Number(p.archetype) || 0, archetypeName: LookupService.idToName('archetype', Number(p.archetype) || 0) || '', overall: Number(p.overall) };
    for (const k of RATING_KEYS) row[k] = Number(p[k]) || 0;
    out.push(row);
  }
}
const dest = path.join(__dirname, '..', 'cache', `game-prospects-${version}.json`);
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} (${out.length} prospects)`);
