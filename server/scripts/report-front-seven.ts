/**
 * Audit the front-seven classifier for one or more draft years: prints every
 * linebacker-bucket player with the verdict (edge / SAM / MIKE / WILL / none),
 * the reason, the drafting team's scheme, and the sack rate — so a human can
 * eyeball which 3-4 OLBs became edges and which off-ball backers got pinned.
 *
 *   npx tsx scripts/report-front-seven.ts 1982 1986 2003
 *   npx tsx scripts/report-front-seven.ts 1980-1989            # a range
 *   npx tsx scripts/report-front-seven.ts 1985 --all            # include non-LB players
 *   npx tsx scripts/report-front-seven.ts 1975 1985 --counts    # final front-seven counts of the
 *                                                               # generated class vs Madden's own mix
 */
import { enrichedClass } from '../src/services/DraftEnrichment';
import { DraftClassBuilder } from '../src/services/DraftClassBuilder';
import { PositionMapper } from '../src/services/PositionMapper';
import { PlayerLookupService } from '../src/services/PlayerLookupService';

/** Final position counts of the generated class (after the LB / edge balancing). */
async function counts(ys: number[]): Promise<void> {
  const pad = (n: number) => String(n).padStart(3);
  for (const year of ys) {
    const { players } = await enrichedClass(year, 'NFL', { fill: true });
    const { prospects } = DraftClassBuilder.buildProspects(players, 'madden', {}, 'm26');
    const c: Record<string, number> = {};
    for (const p of prospects) {
      const n = PositionMapper.name(Number(p.position));
      c[n] = (c[n] || 0) + 1;
    }
    console.log(`${year}: LEDG ${pad(c.LEDG || 0)} REDG ${pad(c.REDG || 0)} | SAM ${pad(c.SAM || 0)} MIKE ${pad(c.MIKE || 0)} WILL ${pad(c.WILL || 0)} | DT ${pad(c.DT || 0)} | LT ${pad(c.LT || 0)} LG ${pad(c.LG || 0)} C ${pad(c.C || 0)} RG ${pad(c.RG || 0)} RT ${pad(c.RT || 0)} | CB ${pad(c.CB || 0)} FS ${pad(c.FS || 0)} SS ${pad(c.SS || 0)}  (n=${prospects.length})`);
  }
  console.log('Madden (avg of 5 real M26 classes): LEDG  18 REDG  18 | SAM  12 MIKE  16 WILL  12 | DT  42 | LT  20 LG  13 C  10 RG  13 RT  16 | CB  40 FS  16 SS  16');
}

const LB_BUCKET = /^(LB|MLB|ILB|OLB|LOLB|ROLB)$/i;

function years(args: string[]): number[] {
  const out: number[] = [];
  for (const a of args) {
    const m = /^(\d{4})-(\d{4})$/.exec(a);
    if (m) for (let y = +m[1]; y <= +m[2]; y++) out.push(y);
    else if (/^\d{4}$/.test(a)) out.push(+a);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const ys = years(args);
  if (!ys.length) {
    console.error('usage: tsx scripts/report-front-seven.ts <year|from-to> [...] [--all]');
    process.exit(1);
  }
  if (args.includes('--counts')) {
    await counts(ys);
    return;
  }
  const totals = { edge: 0, mike: 0, sam: 0, will: 0, none: 0, lb: 0 };
  for (const year of ys) {
    const raw = PlayerLookupService.byYear(year, 'NFL');
    const { players } = await enrichedClass(year, 'NFL', { fill: false });
    const rawByKey = new Map(raw.map((p) => [`${p.firstName}|${p.lastName}|${p.draftPick}`, p]));
    console.log(`\n=== ${year} ===`);
    console.log('pick  name                      src   ->  madden  role  reason            scheme team  sacks/yr');
    for (const p of players) {
      const src = rawByKey.get(`${p.firstName}|${p.lastName}|${p.draftPick}`);
      const srcPos = src?.position ?? p.position;
      if (!all && !LB_BUCKET.test(srcPos.trim())) continue;
      const id = PositionMapper.resolve(p.firstName, p.lastName, p.position, p.weight);
      const f = p.frontSeven;
      const role = f?.role ?? (PositionMapper.groupFromId(id) === 'EDGE' ? 'EDGE' : '-');
      if (LB_BUCKET.test(srcPos.trim())) {
        totals.lb++;
        if (role === 'EDGE') totals.edge++;
        else if (role === 'MIKE') totals.mike++;
        else if (role === 'SAM') totals.sam++;
        else if (role === 'WILL') totals.will++;
        else totals.none++;
      }
      const name = `${p.firstName} ${p.lastName}`.slice(0, 25).padEnd(25);
      console.log(
        `${String(p.draftPick ?? '').padStart(4)}  ${name} ${srcPos.padEnd(5)} ->  ${PositionMapper.name(id).padEnd(6)}  ${String(role).padEnd(5)} ${(f?.reason ?? '').padEnd(17)} ${(f?.scheme ?? '').padEnd(6)} ${(f?.team ?? '').padEnd(5)} ${f?.sackRate != null ? f.sackRate : ''}`
      );
    }
  }
  console.log(`\nLB-bucket totals: ${totals.lb} players -> edge ${totals.edge}, MIKE ${totals.mike}, SAM ${totals.sam}, WILL ${totals.will}, unpinned ${totals.none}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
