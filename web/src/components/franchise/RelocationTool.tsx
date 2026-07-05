import { useEffect, useState } from 'react';
import { api, type TeamIdentity, type RgbColor, type RelocateRebrandOptions, type RelocateRebrandResult } from '../../api';
import { Field, ToolHeader, ErrorCard, cardCls, inputCls, btnPrimary } from './shared';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const rgbToHex = (c: RgbColor) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
const hexToRgb = (h: string): RgbColor => ({ r: parseInt(h.slice(1, 3), 16) || 0, g: parseInt(h.slice(3, 5), 16) || 0, b: parseInt(h.slice(5, 7), 16) || 0 });

export function RelocationTool({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [teams, setTeams] = useState<TeamIdentity[]>([]);
  const [teamIndex, setTeamIndex] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [nick, setNick] = useState('');
  const [city, setCity] = useState('');
  const [abbr, setAbbr] = useState('');
  const [primary, setPrimary] = useState('#000000');
  const [secondary, setSecondary] = useState('#000000');
  const [hub, setHub] = useState('#000000');
  const [logo, setLogo] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RelocateRebrandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const team = teams.find((t) => t.teamIndex === teamIndex) ?? null;

  useEffect(() => {
    if (!save) { setTeams([]); setTeamIndex(null); return; }
    setResult(null); setError(null);
    api.franchiseTeams(save)
      .then((r) => { setTeams(r.teams); setTeamIndex(r.teams[0]?.teamIndex ?? null); })
      .catch(() => { setTeams([]); setTeamIndex(null); });
  }, [save]);

  useEffect(() => {
    const t = teams.find((x) => x.teamIndex === teamIndex);
    if (!t) return;
    setName(t.displayName); setNick(t.nickName); setCity(t.city); setAbbr(t.abbreviation);
    setPrimary(rgbToHex(t.primary)); setSecondary(rgbToHex(t.secondary)); setHub(rgbToHex(t.hub));
    setLogo(t.logoId); setResult(null); setError(null);
  }, [teamIndex, teams]);

  async function run() {
    if (!save || !team) return;
    setBusy(true); setError(null); setResult(null);
    const opts: RelocateRebrandOptions = { teamIndex: team.teamIndex };
    const changed = (a: string, b: string) => a.toLowerCase() !== b.toLowerCase();
    if (name !== team.displayName) opts.displayName = name;
    if (nick !== team.nickName) opts.nickName = nick;
    if (city !== team.city) opts.city = city;
    if (abbr !== team.abbreviation) opts.abbreviation = abbr;
    if (changed(primary, rgbToHex(team.primary))) opts.primary = hexToRgb(primary);
    if (changed(secondary, rgbToHex(team.secondary))) opts.secondary = hexToRgb(secondary);
    if (changed(hub, rgbToHex(team.hub))) opts.hub = hexToRgb(hub);
    if (logo !== team.logoId) opts.logoId = logo;
    if (Object.keys(opts).length <= 1) { setError('No changes — edit a field first.'); setBusy(false); return; }
    try {
      setResult(await api.franchiseRelocateRebrand(save, opts));
      onWrote?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToolHeader title="Relocation & Rebrand">
        Rename a team, move its city, and recolor it. Edits the team in place — schedule, standings, and rosters
        stay attached — and writes a new <code className="rounded bg-black/30 px-1">CAREER-…-REBRAND</code> /{' '}
        <code className="rounded bg-black/30 px-1">-RELOCATE</code> file.
      </ToolHeader>

      <div className={cardCls}>
        <Field label="Team">
          <select value={teamIndex ?? ''} onChange={(e) => setTeamIndex(e.target.value === '' ? null : Number(e.target.value))} className={inputCls}>
            {teams.length === 0 && <option value="">{save ? 'Loading teams…' : 'Pick a save first'}</option>}
            {teams.map((t) => (
              <option key={t.teamIndex} value={t.teamIndex}>{t.city} {t.displayName} ({t.abbreviation})</option>
            ))}
          </select>
        </Field>

        {team && (
          <>
            {team.locked && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                This team is flagged <code className="rounded bg-black/30 px-1">TEAM_LOCKED</code> — edits may not stick in-game.
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="City" hint="max 16 — moving this makes it a relocation">
                <input value={city} maxLength={16} onChange={(e) => setCity(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Team name" hint="max 18">
                <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Nickname" hint="max 18">
                <input value={nick} maxLength={18} onChange={(e) => setNick(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Abbreviation" hint="max 8 · 2–4 ideal">
                <input value={abbr} maxLength={8} onChange={(e) => setAbbr(e.target.value.toUpperCase())} className={inputCls} />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-5">
              <Field label="Primary">
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-16 cursor-pointer rounded border border-border bg-surface-0" />
              </Field>
              <Field label="Secondary">
                <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-16 cursor-pointer rounded border border-border bg-surface-0" />
              </Field>
              <Field label="Hub / menu">
                <input type="color" value={hub} onChange={(e) => setHub(e.target.value)} className="h-9 w-16 cursor-pointer rounded border border-border bg-surface-0" />
              </Field>
              <Field label="Logo ID" hint="0–31 = stock team logos">
                <input type="number" min={0} max={2047} value={logo} onChange={(e) => setLogo(Number(e.target.value))} className={`${inputCls} max-w-[7rem]`} />
              </Field>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-md border border-border/60 bg-surface-0 p-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded text-[10px] font-bold" style={{ backgroundColor: primary, color: secondary }}>
                {abbr || '—'}
              </span>
              <div className="text-sm">
                <div className="font-semibold text-neutral-100">{city} {name}</div>
                <div className="text-xs text-muted">was {team.city} {team.displayName} ({team.abbreviation}) · logo {team.logoId}</div>
              </div>
            </div>
          </>
        )}

        <button onClick={run} disabled={busy || !save || !team} className={`mt-4 ${btnPrimary}`}>
          {busy ? 'Applying…' : 'Apply → new save'}
        </button>
      </div>

      {error && <ErrorCard message={error} />}

      {result && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
          <div className="font-semibold text-green-100">
            {result.mode === 'RELOCATE' ? 'Relocated' : 'Rebranded'} to {result.teamName} — wrote{' '}
            <code className="rounded bg-black/30 px-1">{result.output}</code>
          </div>
          {result.changes.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-green-200/90">
              {result.changes.map((c) => (
                <li key={c.field}>
                  <span className="text-neutral-400">{c.field}:</span> {String(c.before) || '∅'} → {String(c.after)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-green-200/70">No fields changed.</div>
          )}
          {result.skippedFields.length > 0 && (
            <div className="mt-1 text-xs text-amber-200/80">Skipped (out of range): {result.skippedFields.join(', ')}</div>
          )}
          <div className="mt-1 text-xs text-green-200/70">Load it in Madden (Franchise → Load).</div>
        </div>
      )}
    </>
  );
}
