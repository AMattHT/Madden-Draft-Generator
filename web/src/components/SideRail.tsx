import { useEffect, useState } from 'react';
import type { AppView } from '../App';
import { railEntries } from '../rosterDoc';
import { Icon, ICONS } from './ui';

const KEY = 'rail:collapsed';

/** The generated rail art, one plate per area; the drawn stroke icon is the fallback. */
const ART: Record<AppView, string> = {
  home: '/art/nav-home.webp?v=6',
  draft: '/art/nav-draft.webp?v=6',
  rosters: '/art/nav-rosters.webp?v=6',
  franchise: '/art/nav-franchise.webp?v=6',
};

function RailArt({ view, path, active }: { view: AppView; path: string; active: boolean }) {
  const [noArt, setNoArt] = useState(false);
  if (noArt) return <Icon path={path} className="h-5 w-5" strokeWidth={2} />;
  return (
    <img
      src={ART[view]}
      alt=""
      onError={() => setNoArt(true)}
      className={`h-7 w-7 object-contain transition-opacity duration-150 ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}
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
      className={`flex shrink-0 flex-col border-r border-white/[0.05] bg-surface-1 py-1.5 transition-[width] duration-200 ${collapsed ? 'w-14' : 'w-14 lg:w-[84px]'}`}
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
            className={`press group relative mx-1.5 my-0.5 flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-medium leading-tight transition-colors duration-150 ${
              collapsed ? 'h-11' : 'h-11 lg:h-[56px]'
            } ${active ? 'bg-primary/10 text-primary-light' : 'text-muted hover:bg-white/[0.04] hover:text-neutral-100'}`}
          >
            <span aria-hidden className={`absolute -left-1.5 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-primary-light transition-opacity duration-150 ${active ? 'opacity-100' : 'opacity-0'}`} />
            <RailArt view={e.view} path={e.icon} active={active} />
            <span className={`text-center ${collapsed ? 'hidden' : 'hidden lg:block'}`}>{e.view === 'draft' ? 'Classes' : e.label}</span>
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
