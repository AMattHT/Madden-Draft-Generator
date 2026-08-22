import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ClassEdits, GearEdits, LikenessStats, PlayerRow, GameVersion } from '../types';
import type { DraftOpts } from '../App';
import { DEV_NAMES } from '../constants';
import { Icon, ICONS } from './ui';

type Msg = { ok: boolean; text: string } | null;

/**
 * Header export control: primary "Download .mdc" button plus a caret menu for
 * the less-used actions — Save directly to the Madden Saves folder (skips the
 * manual file move), Frosty portrait build, CSV. Results show as a bottom-right
 * toast instead of eating layout space.
 */
/** Edit-history and transfer tools supplied by App (undo/redo/clear/export/import). */
export interface EditTools {
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  exportEdits: () => Record<string, unknown> | null;
  importEdits: (doc: Record<string, unknown>) => string | null;
}

export function ExportMenu({
  year,
  league,
  likeness,
  edits,
  gearEdits,
  editedCount,
  mode,
  rows,
  draftOpts,
  gameVersion = 'm26',
  editTools,
}: {
  year: number;
  league: string;
  likeness: LikenessStats;
  edits: ClassEdits;
  gearEdits: GearEdits;
  editedCount: number;
  mode: 'madden' | 'retro';
  rows: PlayerRow[];
  draftOpts: DraftOpts;
  gameVersion?: GameVersion;
  editTools?: EditTools;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadEditsJson() {
    const doc = editTools?.exportEdits();
    if (!doc) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DraftClass_${year}_${league}_edits.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg({ ok: true, text: `Exported ${editedCount} edited players to DraftClass_${year}_${league}_edits.json.` });
  }

  async function importEditsFile(file: File) {
    try {
      const doc = JSON.parse(await file.text());
      const warn = editTools?.importEdits(doc);
      setMsg(warn ? { ok: true, text: warn } : { ok: true, text: `Imported edits from ${file.name}.` });
    } catch (e) {
      setMsg({ ok: false, text: `Import failed: ${(e as Error).message}` });
    }
  }
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'mdc' | 'saves' | 'portraits' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Auto-dismiss successful toasts; errors stay until dismissed.
  useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 9000);
    return () => clearTimeout(t);
  }, [msg]);

  function downloadCsv() {
    const cols = ['Pick', 'First', 'Last', 'Pos', 'OVR', 'Dev', 'wAV', 'Team', 'College', 'HeightIn', 'Weight', 'Age', 'Jersey', 'Round', 'DraftPick'];
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const r of rows) {
      lines.push(
        [r.pick, r.firstName, r.lastName, r.position, r.overall, DEV_NAMES[r.devTrait] ?? r.devTrait, r.wav ?? '', r.team?.abbr ?? '', r.college, r.heightInches, r.weight, r.age, r.jersey, r.round ?? '', r.draftPick ?? '']
          .map(esc)
          .join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DraftClass_${year}_${league}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg({ ok: true, text: `Exported DraftClass_${year}_${league}.csv (${rows.length} rows).` });
  }

  async function downloadMdc() {
    setBusy('mdc');
    setMsg(null);
    try {
      const r = await api.downloadMdc(year, league, edits, mode, gearEdits, draftOpts, gameVersion);
      const savesHint = gameVersion === 'm27' ? 'Documents\\Madden NFL 27\\saves' : 'Documents\\Madden NFL 26\\Saves';
      setMsg({
        ok: true,
        text: `Downloaded CAREERDRAFT-${year}DRAFT — ${r.count} prospects${editedCount ? `, ${editedCount} edited` : ''}. Move it into ${savesHint}, or use “Save to Madden Saves” next time to skip that step.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `Export failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function saveToSaves() {
    setOpen(false);
    setBusy('saves');
    setMsg(null);
    try {
      const r = await api.saveMdcToSaves(year, league, edits, mode, gearEdits, draftOpts, gameVersion);
      const ow = (r as { overwrote?: boolean }).overwrote;
      setMsg({
        ok: true,
        text: `Saved ${r.filename} (${r.count} prospects${editedCount ? `, ${editedCount} edited` : ''}) to your Madden ${gameVersion === 'm27' ? '27' : '26'} Saves folder${ow ? ' — replaced the previous export (kept as .bak)' : ''}. In Madden: Franchise → Choose Draft Class → it’s already there.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `Save to Madden Saves failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function buildPortraits() {
    setOpen(false);
    setBusy('portraits');
    setMsg({ ok: true, text: 'Downloading PFR/Wikipedia headshots…' });
    try {
      const r = await api.buildPortraits(year, league);
      setMsg({
        ok: true,
        text: `2D portraits: ${r.exported} from PFR/Wikipedia${r.errors?.length ? ` (${r.errors.length} failed)` : ''}. Saved to ${r.outputDir}. To see them in Madden menus, import those PNGs in Frosty (same PLPO names).`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `Portrait build failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  const item =
    'flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-xs font-medium text-neutral-200 transition-colors hover:bg-surface-2 disabled:opacity-40';

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-stretch">
        <button
          onClick={downloadMdc}
          disabled={!!busy}
          className="inline-flex items-center gap-2 rounded-l-md bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-[0_2px_10px_rgba(47,107,255,0.3)] transition-colors hover:bg-primary-light disabled:opacity-50"
        >
          <Icon path={ICONS.download} className="h-3.5 w-3.5" />
          {busy === 'mdc' ? 'Exporting…' : 'Download .mdc'}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={!!busy}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More export options"
          className="grid w-7 place-items-center rounded-r-md border-l border-white/20 bg-primary text-white transition-colors hover:bg-primary-light disabled:opacity-50"
        >
          <Icon path={ICONS.chevronDown} className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-border-strong bg-surface-1 py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          <button onClick={saveToSaves} disabled={!!busy} className={item} title="Write the .mdc into Documents\Madden NFL 26\Saves — no manual file move">
            <span>{busy === 'saves' ? 'Saving…' : 'Save to Madden Saves folder'}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-success-light">recommended</span>
          </button>
          <button
            onClick={buildPortraits}
            disabled={!!busy || likeness.customPortrait === 0}
            className={item}
            title={likeness.customPortrait === 0 ? 'No players in this class need a custom photo' : 'Download PFR/Wikipedia headshots for players without a Madden portrait'}
          >
            <span>{busy === 'portraits' ? 'Downloading…' : 'PFR/Wiki 2D portraits'}</span>
            <span className="tabular-nums text-muted">{likeness.customPortrait} eligible</span>
          </button>
          <button
            onClick={() => { setOpen(false); downloadCsv(); }}
            disabled={!!busy}
            className={item}
          >
            <span>Export CSV (spreadsheet)</span>
          </button>
          {editTools && (
            <>
              <div className="my-1 border-t border-border" />
              <div className="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted">Edits</div>
              <button onClick={() => { setOpen(false); editTools.undo(); }} className={item} title="Ctrl+Z"><span>Undo last edit</span><span className="text-muted">Ctrl+Z</span></button>
              <button onClick={() => { setOpen(false); editTools.redo(); }} className={item} title="Ctrl+Shift+Z"><span>Redo</span><span className="text-muted">Ctrl+Shift+Z</span></button>
              <button onClick={() => { setOpen(false); downloadEditsJson(); }} disabled={!editedCount} className={item}><span>Export edits (.json)</span><span className="tabular-nums text-muted">{editedCount}</span></button>
              <button onClick={() => { setOpen(false); fileRef.current?.click(); }} className={item}><span>Import edits (.json)</span></button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importEditsFile(f); e.target.value = ''; }} />
              <button
                onClick={() => { setOpen(false); if (editedCount && window.confirm(`Clear all ${editedCount} edited players for ${year} ${league}? Undo (Ctrl+Z) can bring them back until you reload.`)) editTools.clearAll(); }}
                disabled={!editedCount}
                className={`${item} text-red-300`}
              >
                <span>Clear all edits for this class</span>
              </button>
            </>
          )}
        </div>
      )}

      {msg && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 max-w-md animate-rise rounded-lg border px-4 py-3 text-xs leading-relaxed shadow-2xl ${
            msg.ok ? 'border-success/40 bg-surface-1 text-success-light' : 'border-danger/40 bg-surface-1 text-red-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="min-w-0 break-words">{msg.text}</span>
            <button onClick={() => setMsg(null)} className="shrink-0 rounded p-0.5 text-muted hover:text-neutral-200" aria-label="Dismiss">
              <Icon path={ICONS.close} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
