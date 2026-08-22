import { NflverseCareerService } from '../src/services/NflverseCareerService';
import { EraGearService } from '../src/services/EraGearService';
import { PositionMapper } from '../src/services/PositionMapper';

const names = [
  ['Cris', 'Carter', 1987, 'WR'],
  ['Cornelius', 'Bennett', 1987, 'MIKE'],
  ['Vinny', 'Testaverde', 1987, 'QB'],
  ['Rod', 'Woodson', 1987, 'FS'],
] as const;

for (const [first, last, year, pos] of names) {
  const nv = NflverseCareerService.get(first, last, year);
  const posId = PositionMapper.toM26Id(pos);
  const els = EraGearService.loadoutElements(year, posId, `${first}|${last}|${year}`, 'm27');
  const slot = (s: string) => els.find((e) => e.slotType === s)?.itemAssetName;
  const mask = els.find((e) => !e.slotType && e.itemAssetName.startsWith('GearFaceMask_'))?.itemAssetName;
  console.log({
    name: `${first} ${last}`,
    ht: nv?.heightInches,
    wav: nv?.wav,
    hs: (nv?.headshotUrl || '').slice(0, 80),
    helmet: slot('HeadWear'),
    mask,
    glove: slot('LeftHandWear'),
    visor: slot('Visor'),
    wrist: slot('LeftWristWear'),
    socks: slot('InnerSocks'),
  });
}
