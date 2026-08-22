import { PersonaService } from '../src/services/PersonaService';
import { PositionMapper } from '../src/services/PositionMapper';

const key = 'Cris|Carter';
const ids = PersonaService.dnaFor(key, 'WR', 83);
console.log({ key, ids, names: ids.map(PersonaService.name), group: PositionMapper.groupFromId(3) });

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const h = hash(key);
console.log({ h, emptyBucket: h % 1000, skipped: h % 1000 < 26 });
