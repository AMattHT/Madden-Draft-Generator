/** Verify user edits flow into the exported .mdc: build 2003 with an edit on
 *  pick 2 (Charles Rogers), re-parse the .mdc, and confirm the values changed. */
require('tsx/cjs');
const { PlayerLookupService } = require('../src/services/PlayerLookupService');
const { DraftClassBuilder } = require('../src/services/DraftClassBuilder');
const { MdcService } = require('../src/services/MdcService');

const players = PlayerLookupService.byYear(2003, 'NFL');
const edits = { 2: { overall: 95, speed: 99, awareness: 88, devTrait: 3, position: 3 } };
const { buffer } = DraftClassBuilder.buildMdc(players, edits);
const reparsed = MdcService.parse(buffer);
const p = reparsed[1]; // pick 2 => block index 1

console.log(`pick2: ${p.firstName} ${p.lastName}`);
console.log(`  overall=${p.overall} (exp 95)  speed=${p.speed} (exp 99)  awareness=${p.awareness} (exp 88)`);
console.log(`  devTrait=${p.devTrait} (exp 3)  position=${p.position} (exp 3)`);

const ok =
  Number(p.overall) === 95 &&
  Number(p.speed) === 99 &&
  Number(p.awareness) === 88 &&
  Number(p.devTrait) === 3 &&
  Number(p.position) === 3;
console.log(`\nRESULT: ${ok ? 'PASS ✅ edits applied to .mdc' : 'FAIL ❌'}`);
process.exit(ok ? 0 : 1);
