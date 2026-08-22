import fs from 'fs';
import { PhotoLookService } from '../src/services/PhotoLookService';
import { EraGearService } from '../src/services/EraGearService';

async function main() {
  const buf = fs.readFileSync(process.env.LOCALAPPDATA + '/Temp/carter-hs.png');
  const observed = await PhotoLookService.observeBytes(buf);
  const slots = EraGearService.slotsFromObserved(1987, 3, observed, 'm27');
  console.log({ observed, slotCount: Object.keys(slots).length, helmet: slots.helmet, mask: slots.facemask, glove: slots.gloveLeft });
}
main().catch((e) => { console.error(e); process.exit(1); });
