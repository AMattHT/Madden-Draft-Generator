import { useEffect, useState } from 'react';

/**
 * The update prompt, in the app's own styling.
 *
 * This used to be two native message boxes. An OS dialog is the one piece of UI
 * the app cannot theme -- a grey Windows box over a dark full-bleed window --
 * and it is modal, so it interrupts whatever you were doing to demand an answer
 * about a background download you did not ask about.
 *
 * The desktop shell exposes the update phases through a preload bridge; in a
 * browser `window.desktopUpdater` is undefined and this renders nothing.
 */
type Phase = 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'manual' | 'error';

interface UpdateState {
  phase: Phase;
  version?: string;
  percent?: number;
  portable?: boolean;
}

interface UpdaterBridge {
  subscribe(cb: (s: UpdateState) => void): () => void;
  current(): Promise<UpdateState>;
  check(): Promise<boolean>;
  install(): Promise<boolean>;
  openReleases(): Promise<void>;
}

declare global {
  interface Window {
    desktopUpdater?: UpdaterBridge;
  }
}

/** Phases worth interrupting the page for. A silent background download is not
 *  news; a build waiting to be installed is. */
const SHOWN: Phase[] = ['downloading', 'ready', 'manual'];

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const bridge = window.desktopUpdater;
    if (!bridge) return;
    bridge.current().then(setState).catch(() => {});
    return bridge.subscribe(setState);
  }, []);

  if (!window.desktopUpdater) return null;
  if (!SHOWN.includes(state.phase)) return null;
  // Dismissal is per version, so the next release speaks up again.
  if (dismissed && dismissed === (state.version ?? 'unknown')) return null;

  const version = state.version ? `Version ${state.version}` : 'An update';
  const downloading = state.phase === 'downloading';
  const percent = Math.max(0, Math.min(100, state.percent ?? 0));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
      <div className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-xl border border-border-strong bg-surface-1 shadow-2xl">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-100">
              {downloading && `${version} is downloading`}
              {state.phase === 'ready' && `${version} is ready to install`}
              {state.phase === 'manual' && `${version} is available`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {downloading && 'You can keep working — it installs when you restart.'}
              {state.phase === 'ready' && 'Your generated classes and edits are kept.'}
              {state.phase === 'manual' &&
                'This is the portable build, which cannot replace itself. The releases page has the new one.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state.phase === 'ready' && (
              <button
                onClick={() => {
                  setInstalling(true);
                  window.desktopUpdater?.install().catch(() => setInstalling(false));
                }}
                disabled={installing}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-light disabled:opacity-50"
              >
                {installing ? 'Restarting…' : 'Restart now'}
              </button>
            )}
            {state.phase === 'manual' && (
              <button
                onClick={() => window.desktopUpdater?.openReleases()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-light"
              >
                Get it
              </button>
            )}
            <button
              onClick={() => setDismissed(state.version ?? 'unknown')}
              className="rounded-md px-2.5 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-surface-2 hover:text-neutral-100"
            >
              {state.phase === 'ready' ? 'Later' : 'Dismiss'}
            </button>
          </div>
        </div>
        {downloading && (
          <div
            className="h-0.5 w-full bg-surface-2"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Update download progress"
          >
            <div
              className="h-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
