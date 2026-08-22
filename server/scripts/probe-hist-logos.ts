import { TeamService, logoForHistoricalName } from '../src/services/TeamService';

async function main() {
  const cases: [number, number, string][] = [
    [1983, 1, 'expect Baltimore Colts'],
    [1993, 1, '1993 pick 1'],
    [1995, 1, '1995'],
    [1996, 4, 'Oilers last Houston year-ish'],
    [2001, 1, 'SD/OAK era'],
    [2016, 3, 'last SD draft?'],
  ];
  for (const [year, pick] of [[1983, 1], [1993, 18], [1995, 1], [1996, 14], [1998, 1], [2001, 1], [2015, 3]] as const) {
    const m = await TeamService.byYear(year);
    const t = m.get(pick);
    console.log(year, 'pick', pick, t?.team.abbr, t?.team.name, t?.team.logo);
  }
  console.log('wiki name samples');
  for (const n of ['Houston Oilers', 'Oakland Raiders', 'San Diego Chargers', 'Baltimore Colts', 'Washington Redskins']) {
    console.log(n, logoForHistoricalName(n, 1993));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
