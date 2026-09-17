import { useEffect, useState } from 'react';
import type { AppView } from '../App';
import { railEntries } from '../rosterDoc';

const KEY = 'rail:collapsed';

/** Left navigation: Home, Draft classes, Rosters, Franchise tools. Icons only on narrow
 *  windows or when collapsed; the collapse choice is remembered per browser. */
export function SideRail({ view, onSetView, franchiseEnabled }: { view: AppView; onSetView: (v: AppView) => void; franchiseEnabled: boolean }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* private mode */ } }, [collapsed]);
  const entries = railEntries(franchiseEnabled);
  return (
    <nav aria-label="Areas" className={`flex shrink-0 flex-col border-r border-border bg-surface-1 py-2 ${collapsed ? 'w-14' : 'w-14 lg:w-28'}`}>
      {entries.map((e) => {
        const active = view === e.view;
        return (
          <button key={e.view} onClick={() => onSetView(e.view)} aria-current={active ? 'page' : undefined} title={e.label}
            className={`mx-1.5 my-0.5 flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold leading-tight transition-colors ${active ? 'bg-primary/15 text-primary-light' : 'text-neutral-400 hover:bg-surface-2 hover:text-neutral-100'}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={e.icon} /></svg>
            <span className={`text-center ${collapsed ? 'hidden' : 'hidden lg:block'}`}>{e.label}</span>
          </button>
        );
      })}
      <button onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand' : 'Collapse'} className="mx-1.5 mt-auto hidden rounded-lg px-1 py-2 text-[10px] text-muted hover:bg-surface-2 hover:text-neutral-200 lg:block">
        {collapsed ? '»' : '«'}
      </button>
    </nav>
  );
}
