import { PlayerLookupService } from '../../src/services/PlayerLookupService';
const t = PlayerLookupService.byYear(1969, 'AFL').find((p) => p.lastName === 'Thorpe') ?? PlayerLookupService.byYear(1969, 'NFL').find((p) => p.lastName === 'Thorpe');
console.log(JSON.stringify({ ...t, wikiImageUrl: undefined }, null, 0).slice(0, 700));
