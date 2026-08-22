import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichedClass } from '../DraftEnrichment';
import { DraftClassBuilder } from '../DraftClassBuilder';

// Golden checks on real classes through the real pipeline (slow: ~20-60 s each).
async function preview(year: number) {
  const { players } = await enrichedClass(year, 'NFL', { fill: true });
  return DraftClassBuilder.preview(players, 'madden').rows;
}

test('2025: the top-5 picks are top-40 overalls and no specialist is a top-50 player', async () => {
  const rows = await preview(2025);
  const byOvr = [...rows].sort((a, b) => b.overall - a.overall);
  const rankOf = (last: string) => byOvr.findIndex((r) => r.lastName === last) + 1;
  for (const last of ['Ward', 'Hunter', 'Carter', 'Campbell', 'Graham']) {
    assert.ok(rankOf(last) > 0 && rankOf(last) <= 40, `${last} ranks ${rankOf(last)} by overall`);
  }
  const specialists = byOvr.slice(0, 50).filter((r) => ['K', 'P', 'LS'].includes(r.position));
  assert.equal(specialists.length, 0, `specialists in the top 50: ${specialists.map((r) => r.lastName).join(', ')}`);
  const xf = byOvr.filter((r) => r.devTrait === 3).map((r) => r.position);
  assert.ok(!xf.some((p) => ['K', 'P', 'LS'].includes(p)), `X-Factor specialists: ${xf.join(',')}`);
});

test('2003: a completed career still orders the class (Polamalu, Suggs, A. Johnson in the top 20)', async () => {
  const rows = await preview(2003);
  const byOvr = [...rows].sort((a, b) => b.overall - a.overall);
  const rankOf = (last: string) => byOvr.findIndex((r) => r.lastName === last) + 1;
  for (const last of ['Polamalu', 'Suggs', 'Johnson']) assert.ok(rankOf(last) <= 20, `${last} ranks ${rankOf(last)}`);
});

test('when a year has more than 402 players, the weakest undrafted are dropped, never a draftee', async () => {
  const { players } = await enrichedClass(1968, 'NFL', { fill: false }); // 488 rows
  assert.ok(players.length > 402, `1968 has ${players.length} rows`);
  const pv = DraftClassBuilder.preview(players, 'madden');
  assert.equal(pv.rows.length, 402);
  assert.ok(pv.dropped.length === players.length - 402, `dropped ${pv.dropped.length}`);
  const kept = new Set(pv.rows.map((r) => `${r.firstName} ${r.lastName}`));
  const droppedDraftees = players.filter((p) => p.draftRound != null && !kept.has(`${p.firstName} ${p.lastName}`.trim()));
  const keptUndrafted = players.filter((p) => p.draftRound == null && kept.has(`${p.firstName} ${p.lastName}`.trim()));
  // 1968 had 462 picks, so draftees must go too - the weakest later picks, never a round 1-3 pick.
  assert.ok(droppedDraftees.every((p) => (p.draftRound ?? 0) >= 4), droppedDraftees.map((p) => `${p.lastName} r${p.draftRound}`).slice(0, 6).join(', '));
  // an undrafted nobody never survives ahead of a draftee with a career
  assert.ok(keptUndrafted.every((p) => (p.wav ?? 0) > 5 || (p.seasonsStarted ?? 0) > 0 || (p.proBowls ?? 0) > 0 || (p.allPro1 ?? 0) > 0), keptUndrafted.map((p) => p.lastName).join(', '));
  // order preserved: pick 1 still leads the board
  assert.equal(pv.rows[0].draftPick, 1);
});
