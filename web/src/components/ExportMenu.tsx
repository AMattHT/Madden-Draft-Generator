import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { api, classFileName, type ClassRequestOpts } from '../api';
import type { ClassEdits, GearEdits, LikenessStats, PlayerRow, GameVersion } from '../types';
import { ATTR_COLUMNS } from '../constants';
import { buildClassCsv } from '../csv';
import { Icon, ICONS } from './ui';

type Msg = { ok: boolean; text: string } | null;

/**
 * Header export control: one "Save to Madden" button that writes the class into
 * the Madden Saves folder. The other actions (download the .mdc, CSV, portrait
 * pack, edit history) are registered on `actionsRef` for the File and Edit menus.
 * Results show as a bottom-right toast instead of eating layout space.
 */
/** What the menu bar can trigger on the open class. */
export interface ExportActions {
  downloadMdc: () => void;
  saveToSaves: () => void;
  downloadCsv: () => void;
  buildPortraits: () => void;
  canBuildPortraits: boolean;
  /** Write the full Madden 27 portrait pack for the MMC Portrait Manager. */
  buildFullPortraitPack: () => void;
  exportEditsJson: () => void;
  importEditsPick: () => void;
  clearAllEdits: () => void;
  editedCount: number;
  isFile: boolean;
}
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
  actionsRef,
}: {
  year: number;
  league: string;
  likeness: LikenessStats;
  edits: ClassEdits;
  gearEdits: GearEdits;
  editedCount: number;
  mode: 'madden' | 'retro' | 'launch';
  rows: PlayerRow[];
  draftOpts: ClassRequestOpts;
  gameVersion?: GameVersion;
  editTools?: EditTools;
  /** Filled with this class's actions so the File / Edit menus can call them. */
  actionsRef?: MutableRefObject<ExportActions | null>;
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
  const [busy, setBusy] = useState<'mdc' | 'saves' | 'portraits' | 'fullpack' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  // M27 portrait pack: retired players the game ships no portrait for (Brady,
  // Newton) get their own portrait id, which the pack supplies to the game through
  // the MMC Portrait Manager. Off until the user has imported the pack: without it
  // those ids would show the blank shield.
  const [portraitPack, setPortraitPack] = useState<boolean>(() => {
    try { return localStorage.getItem('mdc.portraitPack') === '1'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('mdc.portraitPack', portraitPack ? '1' : '0'); } catch { /* ignore */ } }, [portraitPack]);
  const usePack = gameVersion === 'm27' && portraitPack;
  // Also fetch NFL/ESPN headshots for players with no other picture (network).
  const [portraitCdn, setPortraitCdn] = useState<boolean>(() => {
    try { return localStorage.getItem('mdc.portraitCdn') === '1'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('mdc.portraitCdn', portraitCdn ? '1' : '0'); } catch { /* ignore */ } }, [portraitCdn]);
  const packNote = (p: { dir: string; count: number; missing?: number } | null | undefined) =>
    p && (p.count > 0 || (p.missing ?? 0) > 0)
      ? ` ${p.count} player${p.count === 1 ? '' : 's'} point at portrait-pack ids (their subset is in ${p.dir}); they show once the Madden 27 portrait pack is imported with the MMC Portrait Manager.${p.missing ? ` ${p.missing} still have no picture — see missing.csv there for the file names to drop in.` : ''}`
      : '';

  // Auto-dismiss successful toasts; errors stay until dismissed.
  useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 9000);
    return () => clearTimeout(t);
  }, [msg]);

  function downloadCsv() {
    const csv = '﻿' + buildClassCsv(rows, edits);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DraftClass_${year}_${league}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg({ ok: true, text: `Exported DraftClass_${year}_${league}.csv — ${rows.length} players with overalls and all ${ATTR_COLUMNS.length} attributes${editedCount ? `, ${editedCount} edited` : ''}.` });
  }

  async function downloadMdc() {
    setBusy('mdc');
    setMsg(null);
    try {
      const r = await api.downloadMdc(year, league, edits, mode, gearEdits, draftOpts, gameVersion, usePack, usePack && portraitCdn);
      const savesHint = gameVersion === 'm27' ? 'Documents\\Madden NFL 27\\saves' : 'Documents\\Madden NFL 26\\Saves';
      setMsg({
        ok: true,
        text: `Downloaded ${draftOpts.source === 'file' ? (draftOpts.name || 'CAREERDRAFT') : draftOpts.source === 'picked' || draftOpts.source === 'team' ? classFileName(draftOpts.name) : draftOpts.source === 'alltime' ? 'CAREERDRAFT-ALLTIMEGREATS' : draftOpts.source === 'decade' ? `CAREERDRAFT-${draftOpts.decade}sGREATS` : `CAREERDRAFT-${year}DRAFT`} — ${r.count} prospects${editedCount ? `, ${editedCount} edited` : ''}. Move it into ${savesHint}, or use “Save to Madden Saves” next time to skip that step.${packNote(r.portraitPack)}`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `Export failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function saveToSaves() {
    setBusy('saves');
    setMsg(null);
    try {
      const r = await api.saveMdcToSaves(year, league, edits, mode, gearEdits, draftOpts, gameVersion, usePack, usePack && portraitCdn);
      const ow = (r as { overwrote?: boolean }).overwrote;
      setMsg({
        ok: true,
        text: `Saved ${r.filename} (${r.count} prospects${editedCount ? `, ${editedCount} edited` : ''}) to your Madden ${gameVersion === 'm27' ? '27' : '26'} Saves folder${ow ? ' — replaced the previous export (kept as .bak)' : ''}. In Madden: Franchise → Choose Draft Class → it’s already there.${packNote(r.portraitPack)}`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `Save to Madden Saves failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function buildFullPortraitPack() {
    setBusy('fullpack');
    setMsg({ ok: true, text: 'Writing the Madden 27 portrait pack (about 5,100 portraits, a minute or two)…' });
    try {
      const r = await api.buildFullPortraitPack();
      setMsg({
        ok: true,
        text: `Madden 27 portrait pack: ${r.count} portraits written${r.skipped ? `, ${r.skipped} already there` : ''}${r.errors?.length ? `, ${r.errors.length} failed` : ''} in ${r.dir}. Import that folder once with the MMC Portrait Manager (Image Library Manager), then export classes with “Portrait pack” on.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `Portrait pack failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function buildPortraits() {
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

  const isFile = draftOpts.source === 'file';
  const canBuildPortraits = !isFile && likeness.customPortrait > 0;
  const clearAllEdits = () => {
    if (!editTools || !editedCount) return;
    if (window.confirm(`Clear all ${editedCount} edited players for ${year} ${league}? Undo (Ctrl+Z) can bring them back until you reload.`)) editTools.clearAll();
  };
  // The File / Edit menus drive these; refreshed every render so counts stay current.
  if (actionsRef) {
    actionsRef.current = {
      downloadMdc, saveToSaves, downloadCsv, buildPortraits, canBuildPortraits, buildFullPortraitPack,
      exportEditsJson: downloadEditsJson, importEditsPick: () => fileRef.current?.click(), clearAllEdits,
      editedCount, isFile,
    };
  }
  useEffect(() => () => { if (actionsRef) actionsRef.current = null; }, [actionsRef]);

  return (
    <div className="relative flex items-center gap-3">
      {gameVersion === 'm27' && !isFile && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400" title="Point retired players Madden 27 has no portrait for (Tom Brady, Cam Newton…) at their own portrait ids. Needs the Madden 27 portrait pack imported once with the MMC Portrait Manager (File → Build Madden 27 portrait pack); without it they show a blank portrait.">
          <input type="checkbox" checked={portraitPack} onChange={(e) => setPortraitPack(e.target.checked)} className="h-3 w-3 accent-primary" />
          Portrait pack
        </label>
      )}
      {usePack && !isFile && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400" title="For players with no Madden portrait and no disc headshot, download the NFL/ESPN headshot nflverse links to (network; cached after the first export).">
          <input type="checkbox" checked={portraitCdn} onChange={(e) => setPortraitCdn(e.target.checked)} className="h-3 w-3 accent-primary" />
          fetch NFL headshots
        </label>
      )}
      <button
        onClick={saveToSaves}
        disabled={!!busy}
        title={isFile ? 'Write the edited class back into the Madden Saves folder under its own name; the previous file is kept as .bak' : `Write the class into your Madden ${gameVersion === 'm27' ? '27' : '26'} Saves folder, ready for Franchise → Choose Draft Class`}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-[0_2px_10px_rgba(47,107,255,0.3)] transition-colors hover:bg-primary-light disabled:opacity-50"
      >
        <Icon path={ICONS.download} className="h-3.5 w-3.5" />
        {busy === 'saves' ? 'Saving…' : busy === 'mdc' ? 'Exporting…' : busy === 'portraits' ? 'Downloading…' : busy === 'fullpack' ? 'Writing pack…' : 'Save to Madden'}
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importEditsFile(f); e.target.value = ''; }} />

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
