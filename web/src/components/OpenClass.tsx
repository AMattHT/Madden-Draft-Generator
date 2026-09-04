import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { GeneratedClass, GameVersion, SaveFileInfo } from '../types';
import { Icon, ICONS } from './ui';

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtWhen = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

function SavesList({ gameVersion, busy, onOpen }: { gameVersion: GameVersion; busy: string | null; onOpen: (name: string) => void }) {
  const [state, setState] = useState<{ dir: string; files: SaveFileInfo[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.openSavesList(gameVersion).then((r) => alive && setState(r)).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [gameVersion]);
  const label = gameVersion === 'm27' ? 'Madden 27' : 'Madden 26';
  return (
    <section className="min-w-0 flex-1 rounded-lg border border-border bg-surface-0">
      <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-neutral-100">{label} Saves</span>
        <span className="truncate text-[10px] text-muted" title={state?.dir}>{state?.dir ?? ''}</span>
      </header>
      <div className="max-h-72 overflow-auto">
        {err && <div className="px-3 py-4 text-xs text-red-300">{err}</div>}
        {!err && !state && <div className="px-3 py-4 text-xs text-muted">Looking…</div>}
        {state && state.files.length === 0 && (
          <div className="px-3 py-5 text-center text-xs text-muted">No draft classes here yet. Export one with “Save to Madden Saves”, or browse for a file below.</div>
        )}
        {state?.files.map((f) => {
          const key = `${gameVersion}:${f.name}`;
          return (
            <button
              key={f.name}
              onClick={() => onOpen(f.name)}
              disabled={!!busy}
              className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-2 disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-100">{f.name}</span>
                <span className="block text-[10px] text-muted">{fmtSize(f.sizeBytes)} · {fmtWhen(f.modified)}</span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">{busy === key ? 'Opening…' : 'Open'}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Open an existing draft class (.mdc): pick one from either game's Saves folder or
 * browse for a file. The class then loads on the board like any other, edits
 * included, and exports back in the game format it came in.
 */
export function OpenClass({ onOpened, onClose }: { onOpened: (cls: GeneratedClass) => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (key: string, fn: () => Promise<GeneratedClass>) => {
    setBusy(key);
    setErr(null);
    try {
      onOpened(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => run('file', () => api.openFile(f.name, String(reader.result)));
    reader.onerror = () => setErr('Could not read that file');
    reader.readAsDataURL(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Open a draft class"
        className="flex w-[880px] max-w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-bold tracking-tight text-neutral-100">Open a draft class</div>
            <div className="text-[11px] text-muted">A CAREERDRAFT file from either game. It opens on the board as it is, every editor works, and it exports back in the same game's format.</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-neutral-200" aria-label="Close">
            <Icon path={ICONS.close} className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4 md:flex-row">
          <SavesList gameVersion="m27" busy={busy} onOpen={(name) => run(`m27:${name}`, () => api.openFromSaves('m27', name))} />
          <SavesList gameVersion="m26" busy={busy} onOpen={(name) => run(`m26:${name}`, () => api.openFromSaves('m26', name))} />
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 disabled:opacity-50"
          >
            {busy === 'file' ? 'Opening…' : 'Browse for a file…'}
          </button>
          <input ref={fileRef} type="file" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="text-[11px] text-muted">Any Madden 26 or 27 draft class, with or without the .mdc extension.</span>
          {err && <span className="ml-auto text-xs text-red-300">{err}</span>}
        </div>
      </div>
    </div>
  );
}
