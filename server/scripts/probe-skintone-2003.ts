import { enrichedClass } from '../src/services/DraftEnrichment';
import { DraftClassBuilder } from '../src/services/DraftClassBuilder';

async function main() {
  const { players } = await enrichedClass(2003, 'NFL', { fill: false });
  const preview = DraftClassBuilder.preview(players, 'madden', {}, 'm27');
  const want = new Set([
    'Carson Palmer', 'Charles Rogers', 'Byron Leftwich', 'Ty Warren',
    'Larry Johnson', 'Nick Barnett', 'Charles Tillman', 'Jordan Gross',
    'Kyle Boller', 'Terrell Suggs', 'Kwame Harris', 'Andre Johnson',
  ]);
  for (const r of preview.rows) {
    const n = `${r.firstName} ${r.lastName}`;
    if (want.has(n) || r.pick <= 8) {
      console.log(String(r.pick).padStart(3), n.padEnd(22), 'tone=' + r.skinTone, r.face, r.genericHead || '');
    }
  }
  const hist: Record<number, number> = {};
  for (const r of preview.rows) hist[r.skinTone] = (hist[r.skinTone] || 0) + 1;
  console.log('hist', hist, 'n', preview.rows.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
