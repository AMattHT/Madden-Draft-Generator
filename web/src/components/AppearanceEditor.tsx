import { useEffect, useMemo, useRef, useState } from 'react';
import type { FaceScan, ToneFromPhoto } from '../types';
import { Icon, ICONS } from './ui';
export type { FaceScan };

const BODY_TYPES = ['Standard', 'Thin', 'Lean', 'Muscular', 'Heavy'] as const;
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

/** The player's real photo, walking a source chain until one loads. */
function ReferencePhoto({ chain }: { chain: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [chain.join('|')]);
  const src = chain[i];
  if (!src) {
    return (
      <div className="grid h-28 w-full place-items-center rounded-md border border-dashed border-border text-center text-[10px] leading-tight text-muted">
        No photo on file
      </div>
    );
  }
  return <img src={src} alt="" onError={() => setI((n) => n + 1)} className="h-28 w-full rounded-md object-cover object-top" />;
}

/**
 * Appearance builder — same chrome as Equipment Builder.
 * Left: the player's reference photo, then Generic faces (by skin tone) / Face
 * scans (M26 or M27 catalog) / Body. Right: searchable thumbnail grid. Picks
 * write into the same edit patch as export; "Fix everywhere" also records them
 * against the player so every class he appears in gets the same look.
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
  referencePhotos = [],
  canFix = false,
  fixed = false,
  onFixEverywhere,
  onUndoFix,
  onToneFromPhoto,
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
  /** Real photos of the player, best first (displayPortraitChain). */
  referencePhotos?: string[];
  /** Real players only: the fix can be pinned to the man, not just this class. */
  canFix?: boolean;
  /** A fix is already recorded for him. */
  fixed?: boolean;
  onFixEverywhere?: () => Promise<void>;
  onUndoFix?: () => Promise<void>;
  onToneFromPhoto?: (input: { imageUrl?: string; imageBase64?: string }) => Promise<ToneFromPhoto>;
  onEdit: (field: string, value: string | number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'generic' | 'scans' | 'body'>(
    currentAsset && !/^gen_/i.test(currentAsset) ? 'scans' : 'generic'
  );
  const [tone, setTone] = useState(currentTone || 4);
  const [query, setQuery] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<ToneFromPhoto | null>(null);
  const [fixState, setFixState] = useState<'idle' | 'busy' | 'saved' | 'undone' | 'error'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

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
  const pickTone = (t: number) => {
    // A tone on its own: the generator keeps choosing the head, from this tone's pool.
    onEdit('skinTone', t);
    setTone(t);
  };
  const resetGenerated = () => {
    onEdit('faceAsset', '');
    if (generatedHead && /^gen_/i.test(generatedHead)) onEdit('genericHeadName', generatedHead);
    onEdit('skinTone', generatedTone);
    onEdit('bodyType', generatedBody);
    setTone(generatedTone);
  };

  const readPhoto = async (input: { imageUrl?: string; imageBase64?: string }) => {
    if (!onToneFromPhoto) return;
    setPhotoBusy(true);
    setPhotoErr(null);
    setSuggest(null);
    try {
      const r = await onToneFromPhoto(input);
      setSuggest(r);
      setTone(r.tone);
      setTab('generic');
    } catch (e) {
      setPhotoErr((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => readPhoto({ imageBase64: String(reader.result) });
    reader.readAsDataURL(f);
  };

  const runFix = async (fn: (() => Promise<void>) | undefined, done: 'saved' | 'undone') => {
    if (!fn) return;
    setFixState('busy');
    try {
      await fn();
      setFixState(done);
      setTimeout(() => setFixState('idle'), 2000);
    } catch {
      setFixState('error');
    }
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
        className="flex h-[80vh] w-[940px] max-w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl outline-none"
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
              {fixed && (
                <span className="ml-1.5 rounded bg-success/20 px-1 text-[9px] font-semibold text-success-light" title="A likeness fix is recorded for this player and applies in every class">
                  FIXED EVERYWHERE
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-neutral-200" aria-label="Close">
            <Icon path={ICONS.close} className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-52 shrink-0 overflow-auto border-r border-border p-2">
            <div className="mb-2 border-b border-border pb-2">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Reference photo</div>
              <ReferencePhoto chain={referencePhotos} />
            </div>
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
                <div className="flex items-center justify-between px-2.5 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Skin tone</span>
                  {onToneFromPhoto && (
                    <button
                      onClick={() => setPhotoOpen((v) => !v)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${photoOpen ? 'bg-primary/20 text-primary-light' : 'text-primary hover:bg-primary/10'}`}
                      title="Read the skin tone off a photo"
                    >
                      From photo…
                    </button>
                  )}
                </div>
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
                      <span>Tone {t}{currentTone === t && <span className="ml-1 text-[9px] text-muted">current</span>}{suggest?.tone === t && <span className="ml-1 text-[9px] text-success-light">photo</span>}</span>
                      <span className="tabular-nums text-[10px] text-muted">{n}</span>
                    </button>
                  );
                })}
                {tone !== currentTone && (
                  <button
                    onClick={() => pickTone(tone)}
                    className="mt-1 w-full rounded-md border border-primary/50 bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary-light hover:bg-primary/20"
                    title="Keep the generated head style but use this tone's pool"
                  >
                    Use tone {tone}
                  </button>
                )}
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

            {tab === 'generic' && photoOpen && onToneFromPhoto && (
              <div className="border-b border-border bg-surface-2/40 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && photoUrl.trim()) readPhoto({ imageUrl: photoUrl.trim() }); }}
                    placeholder="Paste an image address (right-click a photo → Copy image address)"
                    className="min-w-[240px] flex-1 rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => photoUrl.trim() && readPhoto({ imageUrl: photoUrl.trim() })}
                    disabled={photoBusy || !photoUrl.trim()}
                    className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {photoBusy ? 'Reading…' : 'Read tone'}
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={photoBusy}
                    className="rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-2 disabled:opacity-50"
                  >
                    Upload…
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                  {referencePhotos[0] && (
                    <button
                      onClick={() => readPhoto({ imageUrl: referencePhotos[0].startsWith('/api/image?url=') ? decodeURIComponent(referencePhotos[0].slice('/api/image?url='.length)) : new URL(referencePhotos[0], window.location.origin).toString() })}
                      disabled={photoBusy}
                      className="rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-2 disabled:opacity-50"
                      title="Use the reference photo on the left"
                    >
                      Use reference
                    </button>
                  )}
                </div>
                {photoErr && <div className="mt-1.5 text-[11px] text-red-300">{photoErr}</div>}
                {suggest && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-300">
                    <span>
                      Photo reads <b className="text-neutral-100">tone {suggest.tone}</b>
                      {suggest.rawTone != null && suggest.rawTone !== suggest.tone && <span className="text-muted"> (raw {suggest.rawTone}, weighed against the era)</span>}
                      {suggest.greyscale && <span className="text-muted"> · black-and-white photo, less certain</span>}
                    </span>
                    <button onClick={() => pickTone(suggest.tone)} className="rounded-md border border-success/50 bg-success/10 px-2 py-1 text-[11px] font-medium text-success-light hover:bg-success/20">
                      Use tone {suggest.tone}
                    </button>
                    {suggest.heads.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted">closest heads:</span>
                        {suggest.heads.map((code) => (
                          <button key={code} onClick={() => pickGeneric(code)} title={code} className={`overflow-hidden rounded-md border ${currentHead === code ? 'border-primary' : 'border-border hover:border-border-strong'}`}>
                            <FaceThumb src={`/api/portrait/generic-head/${encodeURIComponent(code)}`} className="h-10 w-10" />
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                )}
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
              <span>Real face asset (generated) · tone {currentTone}</span>
            ) : (
              <span>Generated default · tone {currentTone}</span>
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
          {canFix && fixed && onUndoFix && (
            <button
              onClick={() => runFix(onUndoFix, 'undone')}
              disabled={fixState === 'busy'}
              className="shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-[10px] font-medium text-neutral-300 hover:bg-surface-2 disabled:opacity-50"
              title="Forget the recorded fix; the generator decides again"
            >
              {fixState === 'undone' ? 'Fix removed' : 'Undo fix'}
            </button>
          )}
          {canFix && onFixEverywhere && (
            <button
              onClick={() => runFix(onFixEverywhere, 'saved')}
              disabled={fixState === 'busy'}
              className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                fixState === 'saved' ? 'bg-success/20 text-success-light' : fixState === 'error' ? 'bg-danger/20 text-red-200' : 'bg-success/15 text-success-light ring-1 ring-success/40 hover:bg-success/25'
              }`}
              title="Record this tone, face and body for the player himself, so every class he appears in uses it (this class, All-Time, By team, Studio)"
            >
              {fixState === 'busy' ? 'Saving…' : fixState === 'saved' ? 'Fixed everywhere ✓' : fixState === 'error' ? 'Could not save' : 'Fix everywhere'}
            </button>
          )}
          <button onClick={onClose} className="shrink-0 rounded-md bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-neutral-200 hover:bg-surface-3">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
