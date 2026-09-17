import { useEffect, useState } from 'react';
import type { AppView } from '../App';
import { railEntries } from '../rosterDoc';
import { Icon, ICONS } from './ui';

const KEY = 'rail:collapsed';

/** The generated rail art, one plate per area; the drawn stroke icon is the fallback. */
const ART: Record<AppView, string> = {
  home: '/art/nav-home.webp',
  draft: '/art/nav-draft.webp',
  rosters: '/art/nav-rosters.webp',
  franchise: '/art/nav-franchise.webp',
};

function RailArt({ view, path, active }: { view: AppView; path: string; active: boolean }) {
  const [noArt, setNoArt] = useState(false);
  if (noArt) return <Icon path={path} className="h-5 w-5" strokeWidth={2} />;
  return (
    <img
      src={ART[view]}
      alt=""
      onError={() => setNoArt(true)}
      className={`h-7 w-7 object-contain transition-all duration-200 ${active ? 'opacity-100 drop-shadow-[0_0_10px_rgba(111,155,255,0.55)]' : 'opacity-55 grayscale-[35%] group-hover:opacity-90 group-hover:grayscale-0'}`}
    />
  );
}

/** Left navigation: Home, Draft classes, Rosters, Franchise tools.
 *
 *  A slim glass column. The active entry carries a lit bar on its left edge and
 *  a tinted tile; the label sits under the art when there is room. Collapsing
 *  is remembered per browser. */
export function SideRail({ view, onSetView, franchiseEnabled }: { view: AppView; onSetView: (v: AppView) => void; franchiseEnabled: boolean }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* private mode */ } }, [collapsed]);
  const entries = railEntries(franchiseEnabled);
  return (
    <nav
      aria-label="Areas"
      className={`flex shrink-0 flex-col border-r border-white/[0.05] bg-surface-1/70 py-2 backdrop-blur-md transition-[width] duration-300 ${collapsed ? 'w-16' : 'w-16 lg:w-[92px]'}`}
      style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}
    >
      {entries.map((e) => {
        const active = view === e.view;
        return (
          <button
            key={e.view}
            onClick={() => onSetView(e.view)}
            aria-current={active ? 'page' : undefined}
            title={e.label}
            className={`press group relative mx-2 my-0.5 flex flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-tight transition-all duration-200 ${
              collapsed ? 'h-12' : 'h-12 lg:h-[64px]'
            } ${active ? 'bg-primary/12 text-primary-light' : 'text-neutral-500 hover:bg-white/[0.05] hover:text-neutral-100'}`}
          >
            {/* Lit edge on the active tile. */}
            <span aria-hidden className={`absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary-light shadow-[0_0_10px_rgba(111,155,255,0.9)] transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
            <RailArt view={e.view} path={e.icon} active={active} />
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
