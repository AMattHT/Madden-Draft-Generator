import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type ArchetypeOption } from '../api';
import { cache } from '../cache';
import { DEV_NAMES, POS_GROUP_ORDER, POS_NAMES } from '../constants';
import type { BoardEntry, CatalogPlayer, CustomClass, CustomPlayer } from '../types';
import { Button, Icon, ICONS, IconButton, Portrait, RatingChip, Switch, TeamLogo } from './ui';
import { CatalogPanel, headshot, headshotFallback } from './CatalogPanel';

const CAP = 402;
const ROUND = 32;
const ROW_H = 44;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const blank = (): CustomClass => ({ id: newId(), name: '', board: [], createdAt: Date.now(), updatedAt: Date.now() });
const entryId = (e: BoardEntry) => ('key' in e ? e.key : `custom:${e.custom.id}`);
const blankCustom = (): CustomPlayer => ({
  id: newId(), firstName: '', lastName: '', position: 'QB', college: '', heightInches: 74, weight: 220, age: 22,
  jersey: null, overall: 70, devTrait: 0, archetype: null, skinTone: 4,
});
const ftIn = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;

/**
 * Class Studio: build a draft class from the whole pool. Catalog on the left,
 * a pick-ordered board on the right (drag to reorder, move to a pick, remove),
 * and a drawer for custom prospects. Save by name, then generate.
 */
export function ClassStudio({ initial, onClose, onGenerate }: {
  initial: CustomClass | null;
  onClose: () => void;
  onGenerate: (c: CustomClass, fill: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CustomClass[]>([]);
  const [draft, setDraft] = useState<CustomClass>(initial ?? blank());
  const [fill, setFill] = useState(true);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [shownKeys, setShownKeys] = useState<string[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [moveAt, setMoveAt] = useState<{ index: number; value: string } | null>(null);
  const [drawer, setDrawer] = useState<{ player: CustomPlayer; index: number | null } | null>(null);
  const [archetypes, setArchetypes] = useState<Record<string, ArchetypeOption[]>>({});
  const [classesOpen, setClassesOpen] = useState(false);
  const classesRef = useRef<HTMLDivElement>(null);

  const loadCatalog = () => {
    setError(null);
    api.catalog().then(setCatalog).catch((e) => setError((e as Error).message));
  };
  useEffect(loadCatalog, []);
  useEffect(() => { cache.customList().then(setSaved); }, []);
  useEffect(() => { api.archetypesByPosition().then(setArchetypes).catch(() => {}); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (drawer) setDrawer(null); else if (classesOpen) setClassesOpen(false); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, drawer, classesOpen]);
  useEffect(() => {
    if (!classesOpen) return;
    const onDown = (e: MouseEvent) => { if (classesRef.current && !classesRef.current.contains(e.target as Node)) setClassesOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [classesOpen]);

  const byKey = useMemo(() => new Map((catalog ?? []).map((p) => [p.key, p])), [catalog]);
  const onBoard = useMemo(() => new Map(draft.board.map((e, i) => [entryId(e), i])), [draft.board]);
  const colleges = useMemo(() => [...new Set((catalog ?? []).map((p) => p.college).filter(Boolean))].sort(), [catalog]);

  const setBoard = (board: BoardEntry[]) => setDraft((d) => ({ ...d, board, updatedAt: Date.now() }));
  const full = draft.board.length >= CAP;
  const add = (key: string) => { if (!onBoard.has(key) && !full) setBoard([...draft.board, { key }]); };
  const removeAt = (i: number) => setBoard(draft.board.filter((_, k) => k !== i));
  const addAllShown = () => {
    const room = CAP - draft.board.length;
    const fresh = shownKeys.filter((key) => !onBoard.has(key)).slice(0, room).map((key) => ({ key }));
    if (fresh.length) setBoard([...draft.board, ...fresh]);
  };
  /** Move the entry at `i` so it lands at pick `j + 1`; everyone between shifts. */
  const move = (i: number, j: number) => {
    const target = Math.max(0, Math.min(draft.board.length - 1, j));
    if (i === target) return;
    const next = [...draft.board];
    const [e] = next.splice(i, 1);
    next.splice(target, 0, e);
    setBoard(next);
  };
  const saveCustom = (p: CustomPlayer, index: number | null) => {
    const entry: BoardEntry = { custom: p };
    if (index == null) { if (full) return; setBoard([...draft.board, entry]); }
    else setBoard(draft.board.map((e, k) => (k === index ? entry : e)));
    setDrawer(null);
  };

  const persist = async (): Promise<CustomClass> => {
    const c = { ...draft, name: draft.name.trim() || 'My class', updatedAt: Date.now() };
    delete (c as { keys?: string[] }).keys;
    await cache.customSet(c);
    setDraft(c);
    setSaved(await cache.customList());
    return c;
  };
  const duplicate = async (c: CustomClass) => {
    const d = { ...c, id: newId(), name: `${c.name} copy`, createdAt: Date.now(), updatedAt: Date.now() };
    await cache.customSet(d);
    setSaved(await cache.customList());
    setDraft(d);
  };
  const del = async (id: string) => {
    await cache.customDel(id);
    setSaved(await cache.customList());
    setConfirmDel(null);
    if (draft.id === id) setDraft(blank());
  };

  // Position-group counts for the board summary.
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of draft.board) {
      const g = 'key' in e ? byKey.get(e.key)?.grp ?? '?' : groupOf(e.custom.position);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...POS_GROUP_ORDER, '?'].filter((g) => m.has(g)).map((g) => [g, m.get(g)!] as const);
  }, [draft.board, byKey]);

  const field = 'h-8 rounded-lg border border-white/[0.07] bg-black/30 px-2.5 text-xs text-neutral-200 transition-colors hover:border-white/[0.14] focus:border-primary focus:outline-none';
  const rounds = Math.ceil(CAP / ROUND);
  const nextOpen = draft.board.length;
  const pct = Math.round((draft.board.length / CAP) * 100);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-surface-0" role="dialog" aria-modal="true" aria-label="Class Studio">
      {/* ---- Header: close, the class's name as its title, saved classes, actions. ---- */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] bg-surface-1/70 px-4 py-2.5 backdrop-blur-md">
        <IconButton label="Close the studio" onClick={onClose}>
          <Icon path={ICONS.chevronLeft} className="h-4 w-4" />
        </IconButton>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Class Studio</div>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Name this class…"
            maxLength={60}
            className="-ml-1 w-72 rounded-md bg-transparent px-1 font-display text-[22px] font-extrabold leading-tight text-neutral-50 placeholder:text-neutral-600 focus:bg-white/[0.04] focus:outline-none"
          />
        </div>

        <div ref={classesRef} className="relative ml-2">
          <Button onClick={() => setClassesOpen((v) => !v)} aria-expanded={classesOpen} title="Your saved classes">
            <Icon path={ICONS.folder} className="h-3.5 w-3.5" />
            My classes
            {saved.length > 0 && <span className="rounded bg-white/[0.08] px-1.5 text-[11px] tabular-nums text-neutral-300">{saved.length}</span>}
            <Icon path={ICONS.chevronDown} className={`h-3 w-3 transition-transform ${classesOpen ? 'rotate-180' : ''}`} />
          </Button>
          {classesOpen && (
            <div className="glass-strong absolute left-0 top-full z-20 mt-2 w-80 animate-pop rounded-xl p-1.5">
              {saved.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted">Nothing saved yet. Build a board and press Save.</div>}
              {saved.map((c) => (
                <div key={c.id} className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${c.id === draft.id ? 'bg-primary/12' : 'hover:bg-white/[0.05]'}`}>
                  <button onClick={() => { setDraft(c); setClassesOpen(false); }} className="min-w-0 flex-1 text-left">
                    <span className={`block truncate text-[13px] font-semibold ${c.id === draft.id ? 'text-primary-light' : 'text-neutral-100'}`}>{c.name}</span>
                    <span className="block text-[11px] text-muted">{c.board.length} player{c.board.length === 1 ? '' : 's'}</span>
                  </button>
                  <IconButton size="xs" label={`Duplicate ${c.name}`} onClick={() => duplicate(c)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                    <Icon path={ICONS.layers} className="h-3.5 w-3.5" />
                  </IconButton>
                  {confirmDel === c.id ? (
                    <Button tone="danger" size="xs" onClick={() => del(c.id)}>Delete?</Button>
                  ) : (
                    <IconButton size="xs" label={`Delete ${c.name}`} onClick={() => setConfirmDel(c.id)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                      <Icon path={ICONS.close} className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <span className="ml-auto" />
        <Switch
          checked={fill}
          onChange={setFill}
          label="Pad to a full class"
          title="A short class is padded with generated prospects from the era of your picks so it imports as a full class"
          className="h-8 rounded-lg border border-white/[0.07] bg-black/30 px-2.5"
        />
        <Button onClick={() => persist()} disabled={!draft.board.length}>Save</Button>
        <Button tone="primary" onClick={async () => onGenerate(await persist(), fill)} disabled={!draft.board.length}>
          <Icon path={ICONS.board} className="h-3.5 w-3.5" /> Generate class
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---- Left: the pool. ---- */}
        <section className="relative flex min-w-0 flex-[1.15] flex-col border-r border-white/[0.06]">
          <CatalogPanel
            catalog={catalog}
            error={error}
            onRetry={loadCatalog}
            status={(key) => { const at = onBoard.get(key); return at != null ? { label: `#${at + 1}`, title: 'On the board at this pick' } : null; }}
            onAdd={add}
            addDisabled={full}
            onListChange={setShownKeys}
            toolbarExtra={<>
              <Button size="xs" onClick={addAllShown} disabled={full || !shownKeys.length} title="Add from the top of this list until the board is full">
                Add all shown
              </Button>
              <Button size="xs" tone="gold" onClick={() => setDrawer({ player: blankCustom(), index: null })} disabled={full} title="Create a prospect who never existed">
                <Icon path={ICONS.plus} className="h-3.5 w-3.5" strokeWidth={2.4} /> Custom player
              </Button>
            </>}
          />

          {drawer && (
            <CustomPlayerDrawer
              player={drawer.player}
              isNew={drawer.index == null}
              archetypes={archetypes}
              colleges={colleges}
              onCancel={() => setDrawer(null)}
              onSave={(p) => saveCustom(p, drawer.index)}
            />
          )}
        </section>

        {/* ---- Right: the board. ---- */}
        <section className="flex min-w-0 flex-1 flex-col bg-surface-1/40">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.06] px-4 py-2.5">
            <span className="text-[13px] font-bold text-neutral-100">Draft board</span>
            <span className="flex items-center gap-2" title={`${draft.board.length} of ${CAP} picks filled`}>
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.06]">
                <span className={`block h-full rounded-full transition-[width] duration-500 ${full ? 'bg-warning' : 'bg-gradient-to-r from-primary to-primary-light'}`} style={{ width: `${pct}%`, transitionTimingFunction: 'var(--ease-out-expo)' }} />
              </span>
              <span className={`font-display text-[15px] font-bold tabular-nums ${full ? 'text-warning' : 'text-neutral-100'}`}>{draft.board.length}<span className="text-[11px] font-semibold text-muted"> / {CAP}</span></span>
            </span>
            <span className="flex flex-wrap items-center gap-1">
              {groupCounts.map(([g, n]) => (
                <span key={g} className="inline-flex h-6 items-center gap-1 rounded-md bg-white/[0.05] px-1.5 text-[11px] font-semibold text-neutral-300 ring-1 ring-white/[0.06]">
                  {g} <span className="tabular-nums text-neutral-500">{n}</span>
                </span>
              ))}
            </span>
            <span className="ml-auto" />
            <Button size="xs" tone="subtle" onClick={() => setBoard([])} disabled={!draft.board.length}>Clear board</Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            {!draft.board.length && (
              <div className="mx-auto mb-2 max-w-md rounded-lg border border-dashed border-white/[0.12] px-4 py-3 text-center text-xs text-muted">
                Add players from the pool and each lands at the next open pick. Drag a pick to reorder it, or use Move to send it to an exact slot.
              </div>
            )}
            {Array.from({ length: rounds }, (_, r) => {
              const start = r * ROUND;
              const end = Math.min(CAP, start + ROUND);
              if (start >= draft.board.length && r > Math.floor(draft.board.length / ROUND)) return null; // rounds past the next open one stay folded
              const filled = Math.max(0, Math.min(end, draft.board.length) - start);
              return (
                <div key={r} className="mb-3">
                  <div className="sticky top-0 z-10 flex items-center gap-3 bg-surface-1/95 px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-light backdrop-blur-md">
                    <span>Round {r + 1}</span>
                    <span className="font-semibold normal-case tracking-normal text-neutral-500">{filled} of {end - start}</span>
                    <span className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                  {Array.from({ length: end - start }, (_, k) => {
                    const i = start + k;
                    const e = draft.board[i];
                    const p = e && 'key' in e ? byKey.get(e.key) ?? null : null;
                    const custom = e && 'custom' in e ? e.custom : null;
                    const over = dragOver === i && dragFrom != null && dragFrom !== i;
                    const isNext = i === nextOpen;
                    return (
                      <div
                        key={i}
                        draggable={!!e}
                        onDragStart={() => setDragFrom(i)}
                        onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                        onDragOver={(ev) => { if (dragFrom != null) { ev.preventDefault(); setDragOver(i); } }}
                        onDrop={(ev) => { ev.preventDefault(); if (dragFrom != null) move(dragFrom, Math.min(i, draft.board.length - 1)); setDragFrom(null); setDragOver(null); }}
                        style={{ height: ROW_H }}
                        className={`group relative flex items-center gap-2.5 rounded-lg px-2 transition-colors ${
                          e ? 'cursor-grab hover:bg-white/[0.035] active:cursor-grabbing' : ''
                        } ${over ? 'ring-1 ring-primary bg-primary/10' : ''} ${dragFrom === i ? 'opacity-40' : ''}`}
                      >
                        <span className={`w-8 shrink-0 text-right font-display text-[15px] font-bold tabular-nums ${e ? 'text-neutral-300' : isNext ? 'text-primary-light' : 'text-neutral-700'}`}>{i + 1}</span>
                        {!e && (
                          <span className={`flex h-8 flex-1 items-center rounded-md border border-dashed px-3 text-[11px] ${isNext ? 'border-primary/40 text-primary-light/80' : 'border-white/[0.06] text-neutral-700'}`}>
                            {isNext ? 'Next open pick' : ''}
                          </span>
                        )}
                        {p && (
                          <>
                            <Portrait src={headshot(p)} fallback={headshotFallback(p)} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-[13px] font-semibold text-neutral-100">{p.first} {p.last}</span>
                                {p.hof && <span className="rounded bg-gold/15 px-1 text-[11px] font-bold text-gold" title="Hall of Fame">HOF</span>}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
                                <span className="font-semibold text-neutral-300">{p.mpos}</span>
                                {p.team && <TeamLogo team={p.team} size="sm" />}
                                <span className="truncate">{p.year}{p.round != null ? ` · Rd ${p.round}` : ' · UDFA'} · {p.college}</span>
                              </span>
                            </span>
                            <RatingChip ovr={p.cal} size="sm" />
                          </>
                        )}
                        {e && 'key' in e && !p && <span className="min-w-0 flex-1 truncate text-xs text-red-300" title={e.key}>Not found in the current data</span>}
                        {custom && (
                          <>
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gold/10 text-gold ring-1 ring-gold/30">
                              <Icon path={ICONS.sparkles} className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-[13px] font-semibold text-neutral-100">{custom.firstName} {custom.lastName}</span>
                                <span className="rounded bg-gold/15 px-1 text-[11px] font-bold text-gold">custom</span>
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-neutral-400">
                                <span className="font-semibold text-neutral-300">{custom.position}</span> · {ftIn(custom.heightInches)} {custom.weight} · {custom.college || 'no college'}
                              </span>
                            </span>
                            <Button size="xs" tone="subtle" onClick={() => setDrawer({ player: custom, index: i })}>Edit</Button>
                            <RatingChip ovr={custom.overall} size="sm" />
                          </>
                        )}
                        {e && (
                          <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            {moveAt?.index === i ? (
                              <form
                                className="flex items-center gap-1"
                                onSubmit={(ev) => { ev.preventDefault(); const n = parseInt(moveAt.value, 10); if (n >= 1) move(i, n - 1); setMoveAt(null); }}
                              >
                                <input autoFocus value={moveAt.value} onChange={(ev) => setMoveAt({ index: i, value: ev.target.value })} onBlur={() => setMoveAt(null)} placeholder="pick" className={`${field} w-16 tabular-nums`} />
                              </form>
                            ) : (
                              <Button size="xs" tone="subtle" onClick={() => setMoveAt({ index: i, value: String(i + 1) })} title="Send to an exact pick">Move</Button>
                            )}
                            <IconButton size="xs" label="Remove from the board" onClick={() => removeAt(i)}>
                              <Icon path={ICONS.close} className="h-3.5 w-3.5" />
                            </IconButton>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function groupOf(pos: string): string {
  const p = pos.toUpperCase();
  if (p === 'QB') return 'QB';
  if (['HB', 'FB'].includes(p)) return 'RB';
  if (p === 'WR') return 'WR';
  if (p === 'TE') return 'TE';
  if (['LT', 'LG', 'C', 'RG', 'RT'].includes(p)) return 'OL';
  if (['LEDG', 'REDG'].includes(p)) return 'EDGE';
  if (p === 'DT') return 'IDL';
  if (['SAM', 'MIKE', 'WILL'].includes(p)) return 'LB';
  if (p === 'CB') return 'CB';
  if (['FS', 'SS'].includes(p)) return 'S';
  return p;
}

const TONES = [1, 2, 3, 4, 5, 6, 7];
const TONE_COLORS = ['#f3d9c4', '#e8c39e', '#d4a276', '#b98457', '#8f5f3b', '#6a4327', '#3f2717'];

/** The custom-prospect form: bio, overall, dev trait and archetype; the app
 *  generates the attributes to match when the class is built. */
function CustomPlayerDrawer({ player, isNew, archetypes, colleges, onCancel, onSave }: {
  player: CustomPlayer;
  isNew: boolean;
  archetypes: Record<string, ArchetypeOption[]>;
  colleges: string[];
  onCancel: () => void;
  onSave: (p: CustomPlayer) => void;
}) {
  const [p, setP] = useState<CustomPlayer>(player);
  const set = <K extends keyof CustomPlayer>(k: K, v: CustomPlayer[K]) => setP((x) => ({ ...x, [k]: v }));
  const opts = archetypes[p.position] ?? [];
  const valid = p.firstName.trim() && p.lastName.trim() && p.overall >= 40 && p.overall <= 99 && p.heightInches >= 60 && p.heightInches <= 84 && p.weight >= 140 && p.weight <= 400 && p.age >= 18 && p.age <= 45;
  const field = 'h-9 rounded-lg border border-white/[0.07] bg-black/30 px-2.5 text-[13px] text-neutral-200 transition-colors hover:border-white/[0.14] focus:border-primary focus:outline-none';
  const label = 'text-[11px] font-bold uppercase tracking-[0.12em] text-muted';
  const feet = Math.floor(p.heightInches / 12), inches = p.heightInches % 12;

  return (
    <div className="absolute inset-0 z-20 flex animate-fade-in flex-col bg-surface-1/92 backdrop-blur-md" role="dialog" aria-label="Custom player">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <IconButton label="Back to the pool" onClick={onCancel}>
          <Icon path={ICONS.chevronLeft} className="h-4 w-4" />
        </IconButton>
        <div className="min-w-0">
          <div className="font-display text-[18px] font-bold text-neutral-50">{isNew ? 'New custom player' : `Edit ${player.firstName} ${player.lastName}`}</div>
          <div className="text-[11px] text-muted">Set who he is and how good. The attributes are generated to match when the class is built; tune them on his card afterwards.</div>
        </div>
      </div>
      <div className="grid max-w-3xl grid-cols-2 gap-x-5 gap-y-4 overflow-auto px-5 py-5 md:grid-cols-4">
        <label className="flex flex-col gap-1.5"><span className={label}>First name</span><input value={p.firstName} onChange={(e) => set('firstName', e.target.value)} maxLength={20} className={field} autoFocus /></label>
        <label className="flex flex-col gap-1.5"><span className={label}>Last name</span><input value={p.lastName} onChange={(e) => set('lastName', e.target.value)} maxLength={20} className={field} /></label>
        <label className="flex flex-col gap-1.5"><span className={label}>Position</span>
          <select value={p.position} onChange={(e) => { set('position', e.target.value); set('archetype', null); }} className={field}>
            {POS_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5"><span className={label}>Archetype</span>
          <select value={p.archetype ?? ''} onChange={(e) => set('archetype', e.target.value === '' ? null : Number(e.target.value))} className={field}>
            <option value="">Best fit for his build</option>
            {opts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1.5"><span className={label}>College</span>
          <input value={p.college} onChange={(e) => set('college', e.target.value)} list="studio-colleges" maxLength={40} className={field} placeholder="e.g. Ohio State" />
          <datalist id="studio-colleges">{colleges.slice(0, 2000).map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1.5"><span className={label}>Height</span>
          <div className="flex items-center gap-1.5">
            <select value={feet} onChange={(e) => set('heightInches', Number(e.target.value) * 12 + inches)} className={`${field} flex-1`}>{[5, 6, 7].map((f) => <option key={f} value={f}>{f} ft</option>)}</select>
            <select value={inches} onChange={(e) => set('heightInches', feet * 12 + Number(e.target.value))} className={`${field} flex-1`}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i} in</option>)}</select>
          </div>
        </label>
        <label className="flex flex-col gap-1.5"><span className={label}>Weight (lb)</span><input type="number" min={140} max={400} value={p.weight} onChange={(e) => set('weight', Number(e.target.value))} className={`${field} tabular-nums`} /></label>
        <label className="flex flex-col gap-1.5"><span className={label}>Age</span><input type="number" min={18} max={45} value={p.age} onChange={(e) => set('age', Number(e.target.value))} className={`${field} tabular-nums`} /></label>
        <label className="flex flex-col gap-1.5"><span className={label}>Jersey (optional)</span><input type="number" min={0} max={99} value={p.jersey ?? ''} onChange={(e) => set('jersey', e.target.value === '' ? null : Number(e.target.value))} className={`${field} tabular-nums`} /></label>
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className={label}>Overall</span>
          <span className="flex items-center gap-3">
            <input type="range" min={40} max={99} value={p.overall} onChange={(e) => set('overall', Number(e.target.value))} className="flex-1" />
            <RatingChip ovr={p.overall} size="md" />
          </span>
        </label>
        <label className="flex flex-col gap-1.5"><span className={label}>Dev trait</span>
          <select value={p.devTrait} onChange={(e) => set('devTrait', Number(e.target.value) as CustomPlayer['devTrait'])} className={field}>
            {DEV_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </label>
        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-4"><span className={label}>Skin tone</span>
          <div className="flex items-center gap-2">
            {TONES.map((t) => (
              <button key={t} type="button" onClick={() => set('skinTone', t)} aria-pressed={p.skinTone === t} className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-surface-1 transition-transform ${p.skinTone === t ? 'scale-110 ring-primary' : 'ring-transparent hover:scale-105'}`} style={{ background: TONE_COLORS[t - 1] }} title={`Tone ${t}`} />
            ))}
            <span className="ml-2 text-[11px] text-muted">Picks his generic face; change it on his card later.</span>
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
        <Button onClick={onCancel}>Cancel</Button>
        <Button tone="primary" onClick={() => valid && onSave({ ...p, firstName: p.firstName.trim(), lastName: p.lastName.trim(), college: p.college.trim() })} disabled={!valid}>
          {isNew ? 'Add to board' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
