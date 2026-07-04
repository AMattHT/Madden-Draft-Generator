import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clear as idbClear } from 'idb-keyval';
import { Icon, ICONS } from './ui';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions so a single bad row / null map doesn't white-screen
 * the whole app. Offers a reload and a "clear cache & reload" (wipes IndexedDB) escape
 * hatch, since a stale cached class from an older CACHE_VERSION is a likely culprit.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center">
        <Icon path={ICONS.warning} className="h-9 w-9 text-amber-400 opacity-80" />
        <div className="text-lg font-semibold text-neutral-100">Something went wrong</div>
        <div className="max-w-md text-sm text-neutral-400">{this.state.error.message}</div>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Reload
          </button>
          <button
            onClick={async () => {
              await idbClear().catch(() => {});
              window.location.reload();
            }}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-surface-2"
          >
            Clear cache &amp; reload
          </button>
        </div>
      </div>
    );
  }
}
