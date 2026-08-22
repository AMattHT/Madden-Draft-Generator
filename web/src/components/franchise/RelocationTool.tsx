import { useEffect, useState } from 'react';
import { api, type TeamIdentity, type RgbColor, type RelocateRebrandOptions, type RelocateRebrandResult } from '../../api';
import { RELOCATION_NAMES, RELOCATION_CITIES } from '../../data/relocationCatalog';
import { Field, ToolHeader, ErrorCard, cardCls, inputCls, btnPrimary } from './shared';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const rgbToHex = (c: RgbColor) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
const hexToRgb = (h: string): RgbColor => ({ r: parseInt(h.slice(1, 3), 16) || 0, g: parseInt(h.slice(3, 5), 16) || 0, b: parseInt(h.slice(5, 7), 16) || 0 });
const cityCode = (city: string) => RELOCATION_CITIES.find((c) => c.name === city)?.code ?? '';

export function RelocationTool({ save, onWrote }: { save: string; onWrote?: () => void }) {
  const [teams, setTeams] = useState<TeamIdentity[]>([]);
  const [teamIndex, setTeamIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [presetName, setPresetName] = useState('');
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

  // Prefill from the picked team's current identity (the Custom-mode starting point).
  useEffect(() => {
    const t = teams.find((x) => x.teamIndex === teamIndex);
    if (!t) return;
    setName(t.displayName); setNick(t.nickName); setCity(t.city); setAbbr(t.abbreviation);
    setPrimary(rgbToHex(t.primary)); setSecondary(rgbToHex(t.secondary)); setHub(rgbToHex(t.hub));
    setLogo(t.logoId); setPresetName(''); setResult(null); setError(null);
  }, [teamIndex, teams]);

  // Preset: choosing a name fills nickname + (default) city + abbreviation + suggested colors.
  function applyPresetName(nm: string) {
    setPresetName(nm);
    const p = RELOCATION_NAMES.find((x) => x.name === nm);
    if (!p) return;
    setName(p.name); setNick(p.name);
    if (p.city) { setCity(p.city); setAbbr(cityCode(p.city) || abbr); }
    if (p.primary) setPrimary(p.primary);
    if (p.secondary) setSecondary(p.secondary);
  }
  function applyPresetCity(c: string) {
    setCity(c);
    const code = cityCode(c);
    if (code) setAbbr(code);
  }

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
    if (Object.keys(opts).length <= 1) { setError('No changes — pick a name/city or edit a field first.'); setBusy(false); return; }
    try {
      setResult(await api.franchiseRelocateRebrand(save, opts));
      onWrote?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const modeBtn = (m: 'preset' | 'custom', label: string) => (
    <button
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${mode === m ? 'bg-primary text-white' : 'border border-border text-neutral-400 hover:text-neutral-200'}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <ToolHeader title="Relocation & Rebrand">
        Move or rebrand a team. <span className="text-neutral-300">Preset</span> uses Madden 26's real relocation
        names + cities (pulled from the game); <span className="text-neutral-300">Custom</span> is free-text. Writes a new{' '}
        <code className="rounded bg-black/30 px-1">CAREER-…-REBRAND</code> /{' '}
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

            <div className="mt-4 flex items-center gap-2">
              {modeBtn('preset', 'Preset')}
              {modeBtn('custom', 'Custom')}
            </div>

            {mode === 'preset' ? (
              <>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Relocation name" hint="Madden 26's real relocation team names">
                    <select value={presetName} onChange={(e) => applyPresetName(e.target.value)} className={inputCls}>
                      <option value="">Choose a name…</option>
                      {RELOCATION_NAMES.map((n) => (
                        <option key={n.name} value={n.name}>{n.name}{n.city ? ` — ${n.city}` : ''}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="City" hint="relocation destinations">
                    <select value={RELOCATION_CITIES.some((c) => c.name === city) ? city : ''} onChange={(e) => applyPresetCity(e.target.value)} className={inputCls}>
                      <option value="">Choose a city…</option>
                      {RELOCATION_CITIES.map((c) => (
                        <option key={c.name} value={c.name}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Abbreviation" hint="max 8 · auto from city">
                    <input value={abbr} maxLength={8} onChange={(e) => setAbbr(e.target.value.toUpperCase())} className={inputCls} />
                  </Field>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Colors below are approximate defaults for each name (Madden's exact per-name values aren't stored in save data) — tweak freely.
                </p>
              </>
            ) : (
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
            )}

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
