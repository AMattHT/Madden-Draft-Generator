import { useState } from 'react';
import { api } from '../api';
import type { ClassEdits, GearEdits, LikenessStats, PlayerRow } from '../types';
import type { DraftOpts } from '../App';
import { DEV_NAMES } from '../constants';
import { Icon, ICONS } from './ui';

export function ExportBar({
  year,
  league,
  likeness,
  edits,
  gearEdits,
  editedCount,
  mode,
  rows,
  draftOpts,
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
}) {
  const greatsFile =
    draftOpts.source === 'alltime' ? 'CAREERDRAFT-ALLTIMEGREATS'
    : draftOpts.source === 'decade' ? `CAREERDRAFT-${draftOpts.decade}sGREATS`
    : null;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
  }

  async function downloadMdc() {
    setBusy('mdc');
    setMsg(null);
    try {
      const r = await api.downloadMdc(year, league, edits, mode, gearEdits, draftOpts);
      const file = greatsFile ?? `CAREERDRAFT-${year}DRAFT`;
      setMsg({
        ok: true,
        text: `Downloaded ${file} — ${r.count} prospects, ${r.asset} real faces${
          editedCount ? `, ${editedCount} edited` : ''
        }. Move it into Documents\\Madden NFL 26\\Saves, then load it in Madden: Franchise → Choose Draft Class.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `Export failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function buildPortraits() {
    setBusy('portraits');
    setMsg({ ok: true, text: 'Building Frosty portrait mod (downloading real photos)…' });
    try {
      const r = await api.buildPortraits(year, league);
      setMsg({
        ok: true,
        text: `Frosty portraits: ${r.exported} exported${
          r.errors?.length ? ` (${r.errors.length} failed)` : ''
        }. Folder: ${r.outputDir}. Import those PNGs into Frosty Mod Manager.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: `Portrait build failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface-1 p-3">
      <button
        onClick={downloadMdc}
        disabled={!!busy}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_10px_rgba(47,107,255,0.3)] transition-colors hover:bg-primary-light disabled:opacity-50"
      >
        <Icon path={ICONS.download} className="h-4 w-4" />
        {busy === 'mdc' ? 'Exporting…' : 'Download .mdc'}
      </button>
      <div className="flex items-center gap-2">
        <button
          onClick={buildPortraits}
          disabled={!!busy || likeness.customPortrait === 0}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-legend/60 px-3 py-2 text-xs font-medium text-legend-light transition-colors hover:bg-legend/10 disabled:opacity-40"
          title={likeness.customPortrait === 0 ? 'No players in this class have a real photo without a Madden face' : ''}
        >
          <Icon path={ICONS.image} className="h-3.5 w-3.5" />
          {busy === 'portraits' ? 'Building…' : 'Frosty Portraits'}
        </button>
        <span className="whitespace-nowrap text-[11px] tabular-nums text-neutral-500">
          {likeness.customPortrait} eligible
        </span>
      </div>
      <button
        onClick={downloadCsv}
        disabled={!!busy}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-surface-3 disabled:opacity-40"
      >
        <Icon path={ICONS.download} className="h-3.5 w-3.5" /> Export CSV (spreadsheet)
      </button>
      {msg && (
        <div
          className={`break-words rounded-md px-3 py-2 text-[11px] leading-relaxed ${
            msg.ok ? 'bg-success/10 text-success-light' : 'bg-danger/10 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
