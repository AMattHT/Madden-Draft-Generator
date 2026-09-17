import { useEffect, useState } from 'react';
import type { PlayerFieldEdit } from '../api';
import type { GearOption } from '../types';
import { ATTR_GROUPS, humanize, tierColor, POS_NAMES } from '../constants';
import { GearEditor } from './GearEditor';
import { Icon, ICONS } from './ui';

const DEVS = ['Normal', 'Star', 'Superstar', 'XFactor'];
const BODY_TYPES = ['Standard', 'Thin', 'Lean', 'Muscular', 'Heavy'];
const inputCls = 'rounded-md border border-border bg-surface-0 px-2 py-1 text-sm text-neutral-200 focus:border-primary focus:outline-none';

export interface EditablePlayer {
  position: string;
  overall: number;
  age: number;
  dev: string;
  jersey: number;
  ratings: Record<string, number>;
  bodyType: string;
  genericHead: string;
  helmet: string;
  facemask: string;
}

/** The per-player edit form shared by the franchise roster editor and the Rosters view:
 *  bio, appearance (body type, generic head, gear) and every rating in groups. */
export function PlayerEditPanel({ title, subtitle, positions, player, edit, onEdit, heads, gearOpts, gameVersion, year, showJersey = false }: {
  title: string;
  subtitle: string;
  positions: string[];
  player: EditablePlayer;
  edit: PlayerFieldEdit | undefined;
  onEdit: (patch: PlayerFieldEdit) => void;
  heads: Record<string, string[]>;
  gearOpts: Record<string, GearOption[]>;
  gameVersion: 'm26' | 'm27';
  year: number;
  showJersey?: boolean;
}) {
  const [gearOpen, setGearOpen] = useState(false);
  const [headTone, setHeadTone] = useState(4);
  const eff = {
    overall: edit?.overall ?? player.overall,
    age: edit?.age ?? player.age,
    dev: edit?.dev ?? player.dev,
    position: edit?.position ?? player.position,
    jersey: edit?.jersey ?? player.jersey,
    bodyType: edit?.bodyType ?? player.bodyType ?? 'Standard',
    genericHead: edit?.genericHead ?? player.genericHead ?? '',
    rating: (k: string) => edit?.ratings?.[k] ?? player.ratings[k] ?? 0,
  };
  useEffect(() => {
    const m = String(eff.genericHead).match(/^gen_(\d+)/i);
    setHeadTone(m ? parseInt(m[1], 10) : 4);
    // Only re-derive when the player or his head changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, eff.genericHead]);
  const headPool = heads[String(headTone)] ?? [];
  const headIdx = headPool.indexOf(eff.genericHead);
  const pickHead = (i: number) => { if (headPool.length) onEdit({ genericHead: headPool[((i % headPool.length) + headPool.length) % headPool.length] }); };
  const gearPatch: Record<string, string> = { helmet: player.helmet, facemask: player.facemask, ...(edit?.gear ?? {}) };
  const editRating = (k: string, v: number) => onEdit({ ratings: { [k]: v } });

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-surface-1 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-base font-bold text-neutral-50">{title}</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: tierColor(eff.overall) }}>{eff.overall}</div>
        </div>
        <div className="text-xs text-muted">{subtitle}</div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Overall</span>
            <input type="number" min={0} max={99} value={eff.overall} onChange={(ev) => onEdit({ overall: Number(ev.target.value) })} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Age</span>
            <input type="number" min={18} max={50} value={eff.age} onChange={(ev) => onEdit({ age: Number(ev.target.value) })} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Position</span>
            <select value={eff.position} onChange={(ev) => onEdit({ position: ev.target.value })} className={inputCls}>
              {positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Dev trait</span>
            <select value={eff.dev} onChange={(ev) => onEdit({ dev: ev.target.value })} className={inputCls}>
              {DEVS.map((d) => <option key={d} value={d}>{d === 'XFactor' ? 'X-Factor' : d}</option>)}
            </select></label>
          {showJersey && (
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Jersey</span>
              <input type="number" min={0} max={99} value={eff.jersey} onChange={(ev) => onEdit({ jersey: Number(ev.target.value) })} className={inputCls} /></label>
          )}
        </div>

        {/* Appearance: body type, generic head, gear (helmet/facemask/…) */}
        <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-muted">Body type</span>
              <select value={eff.bodyType} onChange={(ev) => onEdit({ bodyType: ev.target.value })} className={inputCls}>
                {BODY_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Face (generic head)</span>
              <div className="flex items-center gap-1">
                <select value={headTone} onChange={(ev) => setHeadTone(Number(ev.target.value))} className={`${inputCls} px-1`} title="Skin tone">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => <option key={t} value={t}>T{t}</option>)}
                </select>
                <button type="button" onClick={() => pickHead(headIdx < 0 ? 0 : headIdx - 1)} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-xs text-neutral-200 hover:bg-surface-3 disabled:opacity-40">‹</button>
                <span className="flex-1 text-center text-xs tabular-nums text-neutral-300">{headIdx >= 0 ? `${headIdx + 1}/${headPool.length}` : '—'}</span>
                <button type="button" onClick={() => pickHead(headIdx < 0 ? 0 : headIdx + 1)} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-xs text-neutral-200 hover:bg-surface-3 disabled:opacity-40">›</button>
                <button type="button" onClick={() => pickHead(Math.floor(Math.random() * headPool.length))} disabled={!headPool.length} className="rounded border border-border-strong bg-surface-2 px-1.5 py-1 text-neutral-200 hover:bg-surface-3 disabled:opacity-40" title="Random"><Icon path={ICONS.shuffle} className="h-3 w-3" /></button>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setGearOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-surface-3">
            <Icon path={ICONS.image} className="h-3.5 w-3.5" /> Edit gear
          </button>
          <div className="truncate text-[10px] text-muted">
            Helmet: {gearOpts.helmet?.find((o) => o.value === gearPatch.helmet)?.label ?? gearPatch.helmet ?? '—'} · Facemask: {gearOpts.facemask?.find((o) => o.value === gearPatch.facemask)?.label ?? gearPatch.facemask ?? '—'}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {ATTR_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.title}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {g.keys.filter((k) => player.ratings[k] !== undefined).map((k) => (
                  <label key={k} className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-neutral-400" title={humanize(k)}>{humanize(k)}</span>
                    <input type="number" min={0} max={99} value={eff.rating(k)} onChange={(ev) => editRating(k, Number(ev.target.value))}
                      className="w-14 rounded border border-border bg-surface-0 px-1.5 py-0.5 text-right text-sm tabular-nums text-neutral-200 focus:border-primary focus:outline-none" />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {gearOpen && (
        <GearEditor
          playerName={title}
          options={gearOpts}
          gearPatch={gearPatch}
          onGearEdit={(slot, asset) => onEdit({ gear: { [slot]: asset } })}
          onClose={() => setGearOpen(false)}
          gameVersion={gameVersion}
          year={year}
          positionId={Math.max(0, POS_NAMES.indexOf(eff.position))}
        />
      )}
    </>
  );
}
