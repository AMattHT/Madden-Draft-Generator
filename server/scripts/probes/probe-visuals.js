/** Dump real M26 draft-class visual loadouts from the template so we learn the
 *  exact slotType / itemAssetName vocabulary the game expects for gear. */
require('tsx/cjs');
const { MdcService } = require('../src/services/MdcService');

const prospects = MdcService.parse(MdcService.loadTemplate());
let shown = 0;
for (let i = 0; i < prospects.length && shown < 3; i++) {
  const v = prospects[i].visuals;
  if (!v || !v.loadouts) continue;
  console.log(`\n=== block ${i} ${prospects[i].firstName} ${prospects[i].lastName} (pos ${prospects[i].position}) ===`);
  console.log('top-level visual keys:', Object.keys(v).join(', '));
  for (const lo of v.loadouts) {
    console.log(`  loadoutType=${lo.loadoutType} outfitType=${lo.outfitType || ''} elements=${(lo.loadoutElements||[]).length}`);
    for (const el of lo.loadoutElements || []) {
      console.log(`    slotType=${(el.slotType||'(none)').padEnd(22)} item=${el.itemAssetName}`);
    }
  }
  shown++;
}
