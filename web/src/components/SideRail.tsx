import { useEffect, useState } from 'react';
import type { AppView } from '../App';
import { railEntries } from '../rosterDoc';
import { Icon, ICONS } from './ui';

const KEY = 'rail:collapsed';

/** Left navigation: Home, Draft classes, Rosters, Franchise tools.
 *
 *  A slim glass column. The active entry carries a lit bar on its left edge and
 *  a tinted tile; the label sits under the icon when there is room. Collapsing
 *  is remembered per browser. */
export function SideRail({ view, onSetView, franchiseEnabled }: { view: AppView; onSetView: (v: AppView) => void; franchiseEnabled: boolean }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* private mode */ } }, [collapsed]);
  const entries = railEntries(franchiseEnabled);
  const activeIdx = Math.max(0, entries.findIndex((e) => e.view === view));
  const tile = collapsed ? 'h-11' : 'h-11 lg:h-[60px]';
  return (
    <nav
      aria-label="Areas"
      className={`relative flex shrink-0 flex-col border-r border-white/[0.05] bg-surface-1/70 py-2 backdrop-blur-md transition-[width] duration-300 ${collapsed ? 'w-16' : 'w-16 lg:w-[88px]'}`}
      style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}
    >
      {/* One lit bar that glides to the active entry. */}
      <span
        aria-hidden
        className="absolute left-0 w-[3px] rounded-r-full bg-primary-light shadow-[0_0_12px_rgba(111,155,255,0.9)] transition-[top,height] duration-300"
        style={{
          top: `calc(8px + ${activeIdx} * (var(--tile) + 4px) + 10px)`,
          height: 'calc(var(--tile) - 20px)',
          ['--tile' as string]: collapsed ? '44px' : undefined,
          transitionTimingFunction: 'var(--ease-out-expo)',
        }}
      />
      <style>{`nav[aria-label="Areas"]{--tile:44px}@media (min-width:1024px){nav[aria-label="Areas"]:not([data-collapsed]){--tile:60px}}`}</style>
      {entries.map((e) => {
        const active = view === e.view;
        return (
          <button
            key={e.view}
            onClick={() => onSetView(e.view)}
            aria-current={active ? 'page' : undefined}
            title={e.label}
            className={`press mx-2 my-0.5 flex ${tile} flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-tight transition-all duration-200 ${
              active
                ? 'bg-primary/12 text-primary-light shadow-[inset_0_1px_0_rgba(111,155,255,0.15)]'
                : 'text-neutral-500 hover:bg-white/[0.05] hover:text-neutral-100'
            }`}
          >
            <Icon path={e.icon} className={`h-5 w-5 transition-transform duration-200 ${active ? 'scale-110' : ''}`} strokeWidth={2} />
            <span className={`text-center ${collapsed ? 'hidden' : 'hidden lg:block'}`}>{e.label}</span>
          </button>
        );
      })}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand' : 'Collapse'}
        className="mx-2 mt-auto hidden h-8 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-neutral-200 lg:grid"
      >
        <Icon path={collapsed ? ICONS.chevronRight : ICONS.chevronLeft} className="h-4 w-4" />
      </button>
    </nav>
  );
}
