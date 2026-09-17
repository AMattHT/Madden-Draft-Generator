import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { RosterData, RosterDoc, SaveFileInfo } from '../../types';
import { Button, Icon, ICONS, IconButton, Pill } from '../ui';

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtWhen = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

/** Where a save came from, so the list reads as three kinds of file, not one. */
type Kind = 'game' | 'ours' | 'other';
const kindOf = (f: SaveFileInfo): Kind =>
  f.name === 'ROSTER-Official' ? 'game' : /^ROSTER-(GATE\d+|[A-Z0-9]{1,16})$/.test(f.name) ? 'ours' : 'other';
const KIND_LABEL: Record<Kind, string> = { game: "The game's roster", ours: 'Written by this app', other: 'Downloaded' };

/** A disc for the game's own file, a pen for ours, a download arrow for the rest. */
function KindGlyph({ kind }: { kind: Kind }) {
  const path =
    kind === 'game'
      ? 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'
      : kind === 'ours'
        ? 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'
        : ICONS.download;
  const tone = kind === 'game' ? 'text-gold bg-gold/10' : kind === 'ours' ? 'text-primary-light bg-primary/12' : 'text-neutral-300 bg-white/[0.05]';
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}>
      <Icon path={path} className="h-4 w-4" />
    </span>
  );
}

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
  // The game's roster first, then downloads, then what this app wrote; newest first within each.
  const order: Record<Kind, number> = { game: 0, other: 1, ours: 2 };
  const files = state ? [...state.files].sort((a, b) => order[kindOf(a)] - order[kindOf(b)] || b.modified - a.modified) : [];

  return (
    <div className="mx-auto w-[1040px] max-w-full animate-view px-2 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="font-display text-[26px] font-extrabold leading-none text-neutral-50">Rosters</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
            Open a Madden 27 ROSTER save, then move, cut, sign and edit its players. Export writes a new file; the one you opened is never changed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <Icon path={ICONS.folder} className="h-3.5 w-3.5" />
            {busy === 'file' ? 'Opening…' : 'Browse for a file'}
          </Button>
          {onNew && (
            <Button tone="primary" onClick={onNew} disabled={!!busy} title="Empty teams, filled from the player pool">
              <Icon path={ICONS.plus} className="h-3.5 w-3.5" strokeWidth={2.4} />
              {busy === 'new' ? 'Opening…' : 'New roster'}
            </Button>
          )}
          <input ref={fileRef} type="file" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </header>

      {err && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-red-200">
          <Icon path={ICONS.warning} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr]">
        {/* ---- Saves folder ---- */}
        <section className="glass overflow-hidden rounded-xl">
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <span className="text-xs font-semibold text-neutral-100">Madden 27 saves folder</span>
            <span className="min-w-0 truncate text-[10.5px] text-muted" title={state?.dir}>{state?.dir ?? ''}</span>
          </header>
          <div className="max-h-[420px] overflow-auto">
            {!state && !err && (
              <div className="flex flex-col" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex h-14 items-center gap-3 border-b border-white/[0.04] px-4" style={{ opacity: 1 - i * 0.25 }}>
                    <span className="skeleton h-9 w-9 rounded-lg" />
                    <span className="flex flex-1 flex-col gap-1.5"><span className="skeleton h-3 w-40" /><span className="skeleton h-2.5 w-24" /></span>
                  </div>
                ))}
              </div>
            )}
            {state?.files.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="text-sm font-semibold text-neutral-200">No ROSTER files in this folder</div>
                <div className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
                  Save a roster in Madden 27 and it appears here, or browse for a ROSTER file you downloaded.
                </div>
              </div>
            )}
            {files.map((f) => {
              const kind = kindOf(f);
              const opening = busy === f.name;
              return (
                <button
                  key={f.name}
                  onClick={() => run(f.name, true, () => api.rosterOpenSaved(f.name))}
                  disabled={!!busy}
                  className="group flex h-14 w-full items-center gap-3 border-b border-white/[0.04] px-4 text-left transition-colors last:border-b-0 hover:bg-white/[0.04] focus-visible:bg-white/[0.04] disabled:opacity-60"
                >
                  <KindGlyph kind={kind} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-neutral-100">{f.name}</span>
                      {kind === 'game' && <Pill tone="gold">Official</Pill>}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {KIND_LABEL[kind]} · {fmtSize(f.sizeBytes)} · {fmtWhen(f.modified)}
                    </span>
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold transition-all ${opening ? 'text-primary-light' : 'text-neutral-500 group-hover:translate-x-0.5 group-hover:text-primary-light'}`}>
                    {opening ? 'Opening…' : 'Open'}
                    {!opening && <Icon path={ICONS.arrowRight} className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- Saved here ---- */}
        <aside className="glass flex flex-col overflow-hidden rounded-xl">
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <span className="text-xs font-semibold text-neutral-100">Your rosters</span>
            <span className="text-[10.5px] tabular-nums text-muted">{savedDocs.length ? `${savedDocs.length} saved` : ''}</span>
          </header>
          {savedDocs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04] text-neutral-500">
                <Icon path={ICONS.users} className="h-5 w-5" />
              </span>
              <div className="mt-3 text-sm font-semibold text-neutral-200">Nothing saved yet</div>
              <div className="mt-1 text-xs leading-relaxed text-muted">Open a save and every move and edit is kept here, tied to the file it started from.</div>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              {savedDocs.map((d) => (
                <div key={d.id} className="group flex h-14 items-center gap-2 border-b border-white/[0.04] px-3 last:border-b-0 hover:bg-white/[0.04]">
                  <button onClick={() => onOpenDoc(d)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success-light">
                      <Icon path={ICONS.users} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-neutral-100">{d.name || 'Untitled roster'}</span>
                      <span className="block truncate text-[11px] text-muted">{d.fresh ? 'From scratch' : `From ${d.base.fileName}`} · {fmtWhen(d.updatedAt)}</span>
                    </span>
                  </button>
                  <IconButton
                    size="xs"
                    label={`Delete ${d.name || 'Untitled roster'}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => { if (confirm(`Delete "${d.name || 'Untitled roster'}"? The base file is not touched.`)) onDeleteDoc(d.id); }}
                  >
                    <Icon path={ICONS.close} className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
