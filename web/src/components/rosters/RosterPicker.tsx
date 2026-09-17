import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { RosterData, RosterDoc, SaveFileInfo } from '../../types';

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtWhen = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
const btn = 'rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/[0.07] disabled:opacity-50';

/** Empty state of the Rosters view: a base file from the saves folder or elsewhere, or a roster saved earlier. */
export function RosterPicker({ savedDocs, onOpenBase, onOpenDoc, onDeleteDoc, onNew }: {
  savedDocs: RosterDoc[];
  onOpenBase: (data: RosterData, fromSaves: boolean) => void;
  onOpenDoc: (doc: RosterDoc) => void;
  onDeleteDoc: (id: string) => void;
  /** Start a roster from scratch: empty teams, filled from the pool. Omitted while re-picking a base. */
  onNew?: () => void;
}) {
  const [state, setState] = useState<{ dir: string; files: SaveFileInfo[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    api.rosterSaves().then((r) => alive && setState(r)).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, []);
  const run = async (key: string, fromSaves: boolean, fn: () => Promise<RosterData>) => {
    setBusy(key); setErr(null);
    try { onOpenBase(await fn(), fromSaves); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => run('file', false, () => api.rosterOpenFile(f.name, String(reader.result)));
    reader.onerror = () => setErr('Could not read that file');
    reader.readAsDataURL(f);
  };
  // Outputs this app wrote are listed after the game's and downloaded rosters.
  const ours = (f: SaveFileInfo) => /^ROSTER-(GATE\d+|[A-Z0-9]{1,16})$/.test(f.name) && f.name !== 'ROSTER-Official';

  return (
    <div className="mx-auto mt-8 grid w-[960px] max-w-full grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold tracking-tight text-neutral-100">Start from a roster</div>
            <p className="mt-1 text-[12px] leading-relaxed text-neutral-400">
              A Madden 27 ROSTER save: the game's own, one you downloaded, or one this app wrote. Move, cut and edit its players, then export a new file. The base file is never changed.
            </p>
          </div>
          {onNew && (
            <button onClick={onNew} disabled={!!busy} title="Empty teams, filled from the player pool" className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-50">
              {busy === 'new' ? 'Opening…' : 'New roster'}
            </button>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-white/[0.07] bg-black/30">
          <header className="flex items-baseline justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
            <span className="text-xs font-semibold text-neutral-100">Madden 27 saves</span>
            <span className="truncate text-[10px] text-muted" title={state?.dir}>{state?.dir ?? ''}</span>
          </header>
          <div className="max-h-80 overflow-auto">
            {!state && !err && <div className="px-3 py-4 text-xs text-muted">Looking…</div>}
            {state?.files.length === 0 && <div className="px-3 py-5 text-center text-xs text-muted">No ROSTER files in this folder. Browse for one below.</div>}
            {state && [...state.files].sort((a, b) => Number(ours(a)) - Number(ours(b)) || b.modified - a.modified).map((f) => (
              <button key={f.name} onClick={() => run(f.name, true, () => api.rosterOpenSaved(f.name))} disabled={!!busy}
                className="flex w-full items-center justify-between gap-3 border-b border-white/[0.05] px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-white/[0.06] disabled:opacity-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-neutral-100">{f.name}</span>
                  <span className="block text-[10px] text-muted">{fmtSize(f.sizeBytes)} · {fmtWhen(f.modified)}{ours(f) ? ' · written by this app' : ''}</span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">{busy === f.name ? 'Opening…' : 'Open'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={btn}>{busy === 'file' ? 'Opening…' : 'Browse for a roster file…'}</button>
          <input ref={fileRef} type="file" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          {err && <span className="text-xs text-red-300">{err}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="text-sm font-bold tracking-tight text-neutral-100">Your rosters</div>
        <p className="mt-1 text-[12px] text-neutral-400">Saved in this app. Each one remembers its base file and your changes.</p>
        <div className="mt-3 flex flex-col gap-1.5">
          {savedDocs.length === 0 && <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted">Nothing saved yet</div>}
          {savedDocs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/30 px-3 py-2">
              <button onClick={() => onOpenDoc(d)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-neutral-100">{d.name || 'Untitled roster'}</span>
                <span className="block truncate text-[10px] text-muted">{d.fresh ? 'from scratch' : `from ${d.base.fileName}`} · {fmtWhen(d.updatedAt)}</span>
              </button>
              <button onClick={() => { if (confirm(`Delete "${d.name || 'Untitled roster'}"? The base file is not touched.`)) onDeleteDoc(d.id); }} className="text-[10px] text-muted hover:text-red-300">Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
