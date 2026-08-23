import { NflverseStatsService } from '../../src/services/NflverseStatsService';
const t0 = Date.now();
for (const [f, l, y] of [['Devin', 'Hester', 2006], ['Taysom', 'Hill', 2017], ['Brad', 'Smith', 2006]] as Array<[string, string, number]>) {
  console.log(f, l, y, 'ambiguous', NflverseStatsService.ambiguous(f, l, y), JSON.stringify(NflverseStatsService.usage(f, l, y))?.slice(0, 160));
}
console.log('ms', Date.now() - t0);
