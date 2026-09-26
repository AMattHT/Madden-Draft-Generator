import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProfileModal } from '../../src/components/ProfileModal';
import { BigBoard } from '../../src/components/BigBoard';
import type { PlayerRow } from '../../src/types';
import '../../src/index.css';

const row: PlayerRow = { id: 1, pick: 1, firstName: 'Rendering', lastName: 'Check', position: 'QB', positionId: 0, overall: 80, devTrait: 0, archetype: 0, archetypeName: 'Strong Arm', draftYear: 2003, round: 1, draftPick: 1, wav: 50, wavSource: 'actual', face: 'generic', college: 'USC', age: 22, heightInches: 77, weight: 230, jersey: 9, bodyType: 'Standard', photoUrl: null, ratings: {}, scouting: [] };
function Fixture() {
  const [open, setOpen] = useState(true);
  const pane = new URLSearchParams(location.search).has('pane');
  return <><header style={{ position: 'relative', zIndex: 40, height: 80, background: '#234' }}>App toolbar</header>
    <main className="animate-view" style={{ marginLeft: 120, width: 900, height: 600, overflow: 'hidden' }}>
      <button onClick={() => setOpen(true)}>Open player</button>
      {open && <ProfileModal row={row} patch={{}} gearPatch={{}} year={2003} archetypeOptions={{}} gameVersion="m26" variant={pane ? 'pane' : undefined} onEdit={() => {}} onGearEdit={() => {}} onReset={() => {}} onClose={() => setOpen(false)} />}
    </main></>;
}
const boardRows = Array.from({ length: 160 }, (_, i) => ({ ...row, id: i + 1, pick: i + 1, firstName: 'Prospect', lastName: String(i + 1), round: Math.floor(i / 32) + 1 }));
function BoardFixture() {
  const [count, setCount] = useState(160);
  const [spoilers, setSpoilers] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  return <>
    <button onClick={() => setCount(1)}>Filter to one</button>
    <button onClick={() => setCount(0)}>Filter to none</button>
    <button onClick={() => setCount(160)}>Clear filter</button>
    <button onClick={() => setSpoilers(s => !s)}>Toggle spoilers</button>
    <output>Selected: {selected}</output>
    <main data-testid="board" style={{ height: 400 }}><BigBoard rows={boardRows.slice(0, count)} all={boardRows} selectedId={selected} onOpen={setSelected} spoilers={spoilers} /></main>
  </>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('board') ? <BoardFixture /> : <Fixture />);
