import { PhotoLookService } from '../src/services/PhotoLookService';
import { EraGearService } from '../src/services/EraGearService';
import { PositionMapper } from '../src/services/PositionMapper';
import { NflverseCareerService } from '../src/services/NflverseCareerService';
import { BaselinePlayer } from '../src/types/player';

function stub(first: string, last: string, year: number, pos: string): BaselinePlayer {
  const nv = NflverseCareerService.get(first, last, year);
  return {
    firstName: first, lastName: last, college: '', draftYear: year,
    draftRound: 1, draftPick: 1, position: pos, jersey: null, league: 'NFL',
    isHOF: false, photoId: null, playerAssetsId: null, commId: null, plpo: null,
    heightInches: nv?.heightInches ?? null, weight: nv?.weight ?? null,
    homeState: null, race: 7, wikiImageUrl: null, pfrImageUrl: null,
    headshotUrl: nv?.headshotUrl ?? null, careerFrom: null, careerTo: null,
    allPro1: null, proBowls: null, seasonsStarted: null, wav: nv?.wav ?? null,
    wavSource: nv?.wav != null ? 'actual' : 'predicted', source: 'local',
  };
}

async function show(first: string, last: string, year: number, pos: string) {
  const p = stub(first, last, year, pos);
  const url = await PhotoLookService.resolvePhoto(p);
  const obs = await PhotoLookService.observe(p);
  const posId = PositionMapper.toM26Id(pos);
  const els = EraGearService.loadoutElements(year, posId, `${first}|${last}`, 'm27', obs);
  const slot = (s: string) => els.find((e) => e.slotType === s)?.itemAssetName;
  const mask = els.find((e) => !e.slotType && e.itemAssetName.startsWith('GearFaceMask_'))?.itemAssetName;
  console.log({
    name: `${first} ${last}`,
    photo: (url || '').slice(0, 90),
    onField: obs?.onField ?? null,
    gloves: obs?.gloves ?? null,
    gloveColor: obs?.gloveColor ?? null,
    wrist: obs?.wristband ?? null,
    helmet: slot('HeadWear'),
    mask,
    glove: slot('LeftHandWear') || '(none)',
  });
}

async function main() {
  await show('Cris', 'Carter', 1987, 'WR');
  await show('Cornelius', 'Bennett', 1987, 'MIKE');
  await show('Vinny', 'Testaverde', 1987, 'QB');
  // no nflverse photo likely — Wikipedia fallback
  await show('Kelly', 'Stouffer', 1987, 'QB');
}
main().catch((e) => { console.error(e); process.exit(1); });
