import { useEffect, useMemo, useState } from 'react';
import type { FaceScan } from '../types';
import { Icon, ICONS } from './ui';
export type { FaceScan };

const BODY_TYPES = ['Standard', 'Thin', 'Muscular', 'Heavy'] as const;
const TONES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function humanizeGen(code: string): string {
  return code.replace(/^gen_/i, '').replace(/_/g, ' ');
}

function FaceThumb({ src, className = 'h-16 w-16' }: { src?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${className} object-cover`}
      />
    );
  }
  return (
    <span className={`grid ${className} place-items-center bg-surface-2 text-neutral-600`}>
      <Icon path={ICONS.image} className="h-6 w-6" />
    </span>
  );
}

/**
 * Appearance builder — same chrome as Equipment Builder.
 * Left: Generic faces (by skin tone) / Face scans (M26 or M27 catalog) / Body.
 * Right: searchable thumbnail grid. Picks write into the same edit patch as export.
 */
export function AppearanceEditor({
  playerName,
  gameVersion = 'm26',
  heads,
  scans,
  currentHead,
  currentAsset,
  currentTone,
  currentBody,
  generatedHead,
  generatedTone,
  generatedBody,
  isRealFace,
  onEdit,
  onClose,
}: {
  playerName: string;
  gameVersion?: 'm26' | 'm27';
  heads: Record<string, string[]>;
  scans: FaceScan[];
  currentHead: string;
  currentAsset: string;
  currentTone: number;
  currentBody: string;
  generatedHead: string;
  generatedTone: number;
  generatedBody: string;
  isRealFace: boolean;
  onEdit: (field: string, value: string | number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'generic' | 'scans' | 'body'>(
    currentAsset && !/^gen_/i.test(currentAsset) ? 'scans' : 'generic'
  );
  const [tone, setTone] = useState(currentTone || 4);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const genPool = heads[String(tone)] ?? [];
  const q = query.trim().toLowerCase();
  const genFiltered = useMemo(
    () => (q ? genPool.filter((c) => c.toLowerCase().includes(q)) : genPool),
    [genPool, q]
  );
  const scanFiltered = useMemo(() => {
    if (q.length < 2) return scans.slice(0, 48);
    return scans.filter((s) => `${s.name} ${s.asset}`.toLowerCase().includes(q)).slice(0, 80);
  }, [scans, q]);

  const pickGeneric = (code: string) => {
    onEdit('genericHeadName', code);
    onEdit('faceAsset', '');
    const m = code.match(/^gen_(\d+)/i);
    if (m) {
      const t = Number(m[1]);
      onEdit('skinTone', t);
      setTone(t);
    }
  };
  const pickScan = (asset: string) => {
    onEdit('faceAsset', asset);
    onEdit('genericHeadName', '');
  };
  const resetGenerated = () => {
    onEdit('faceAsset', '');
    if (generatedHead && /^gen_/i.test(generatedHead)) onEdit('genericHeadName', generatedHead);
    onEdit('skinTone', generatedTone);
    onEdit('bodyType', generatedBody);
    setTone(generatedTone);
  };

  const usingScan = !!(currentAsset && !/^gen_/i.test(currentAsset));
  const scanLabel = gameVersion === 'm27' ? 'M27 face scans' : 'M26 face scans';

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Appearance editor"
        tabIndex={-1}
        ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }}
        className="flex h-[80vh] w-[900px] max-w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-bold tracking-tight text-neutral-100">Appearance Builder</div>
            <div className="text-[11px] text-muted">
              {playerName}{' '}
              <span className="ml-1 rounded bg-gold/20 px-1 text-[9px] font-semibold text-gold">
                {gameVersion === 'm27' ? 'M27' : 'M26'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-neutral-200" aria-label="Close">
            <Icon path={ICONS.close} className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-48 shrink-0 overflow-auto border-r border-border p-2">
            {(
              [
                ['generic', 'Generic faces'],
                ['scans', scanLabel],
                ['body', 'Body type'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setTab(id); setQuery(''); }}
                className={`mb-0.5 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  tab === id ? 'bg-primary text-white' : 'text-neutral-300 hover:bg-surface-2'
                }`}
              >
                {label}
              </button>
            ))}
            {tab === 'generic' && (
              <div className="mt-2 space-y-0.5 border-t border-border pt-2">
                <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Skin tone</div>
                {TONES.map((t) => {
                  const n = (heads[String(t)] ?? []).length;
                  if (!n && t === 8) return null;
                  return (
                    <button
                      key={t}
                      onClick={() => { setTone(t); setQuery(''); }}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs ${
                        tone === t ? 'bg-surface-3 text-neutral-100' : 'text-neutral-400 hover:bg-surface-2 hover:text-neutral-200'
                      }`}
                    >
                      <span>Tone {t}</span>
                      <span className="tabular-nums text-[10px] text-muted">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {tab !== 'body' && (
              <div className="flex items-center gap-2 border-b border-border p-3">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
                    <Icon path={ICONS.search} className="h-4 w-4" />
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tab === 'scans' ? `Search ${scanLabel.toLowerCase()}…` : `Search tone ${tone} heads…`}
                    className="w-full rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-3 text-sm text-neutral-200 placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {tab === 'generic' && (
              <div className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 overflow-auto p-3">
                {genFiltered.map((code) => {
                  const on = currentHead === code && !usingScan;
                  return (
                    <button
                      key={code}
                      onClick={() => pickGeneric(code)}
                      title={code}
                      className={`flex flex-col items-center gap-1 overflow-hidden rounded-lg border p-1.5 transition-colors ${
                        on ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong hover:bg-surface-2'
                      }`}
                    >
                      <FaceThumb src={`/api/portrait/generic-head/${encodeURIComponent(code)}`} className="h-16 w-16 rounded" />
                      <span className="line-clamp-2 w-full text-center text-[10px] leading-tight text-neutral-300">{humanizeGen(code)}</span>
                    </button>
                  );
                })}
                {genFiltered.length === 0 && (
                  <div className="col-span-full py-10 text-center text-xs text-muted">No heads in this tone.</div>
                )}
              </div>
            )}

            {tab === 'scans' && (
              <div className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-auto p-3">
                {scanFiltered.map((s) => {
                  const on = usingScan && currentAsset === s.asset;
                  return (
                    <button
                      key={s.asset}
                      onClick={() => pickScan(s.asset)}
                      title={`${s.name} — ${s.asset}`}
                      className={`flex flex-col items-center gap-1 overflow-hidden rounded-lg border p-1.5 transition-colors ${
                        on ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong hover:bg-surface-2'
                      }`}
                    >
                      <FaceThumb src={s.image} className="h-20 w-20 rounded" />
                      <span className="line-clamp-2 w-full text-center text-[10px] font-medium leading-tight text-neutral-200">{s.name}</span>
                    </button>
                  );
                })}
                {scanFiltered.length === 0 && (
                  <div className="col-span-full py-10 text-center text-xs text-muted">
                    {q.length < 2 ? `No ${scanLabel.toLowerCase()} loaded.` : `No scans match “${query}”.`}
                  </div>
                )}
              </div>
            )}

            {tab === 'body' && (
              <div className="grid flex-1 auto-rows-max grid-cols-2 gap-3 overflow-auto p-4 sm:grid-cols-4">
                {BODY_TYPES.map((b) => (
                  <button
                    key={b}
                    onClick={() => onEdit('bodyType', b)}
                    className={`flex h-28 flex-col items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors ${
                      currentBody === b ? 'border-primary bg-primary/10 text-neutral-100' : 'border-border text-neutral-300 hover:border-border-strong hover:bg-surface-2'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Wearing</span>
          <div className="min-w-0 flex-1 truncate text-[11px] text-neutral-400">
            {usingScan ? (
              <>Scan <span className="text-neutral-200">{currentAsset}</span></>
            ) : currentHead ? (
              <>Head <span className="text-neutral-200">{currentHead}</span> · tone {currentTone}</>
            ) : isRealFace ? (
              <span>Real face asset (generated)</span>
            ) : (
              <span>Generated default</span>
            )}
            {' · '}
            Body <span className="text-neutral-200">{currentBody}</span>
          </div>
          <button
            onClick={resetGenerated}
            className="shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-[10px] font-medium text-neutral-300 hover:bg-surface-2"
          >
            Reset to generated
          </button>
          <button onClick={onClose} className="shrink-0 rounded-md bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-neutral-200 hover:bg-surface-3">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
