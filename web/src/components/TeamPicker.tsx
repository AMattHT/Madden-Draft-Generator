import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { matchTeams, type PickTeam } from '../teamMatch';
import { TeamLogo } from './ui';

/**
 * A team chosen by typing: "seattle", "san fran", "ny j" or "KC" narrows the list
 * as you type; arrows move, Enter picks, Escape cancels. The list is fixed to the
 * viewport so a windowed, scrolling list does not clip it.
 */
export function TeamPicker({ teams, onPick, onCancel, placeholder = 'Add to…', autoFocus = false, className = '' }: {
  teams: PickTeam[];
  onPick: (teamId: number) => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = matchTeams(teams, q);
  useEffect(() => { setActive(0); }, [q]);

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 300;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240), up });
  };
  const show = () => { place(); setOpen(true); };
  const close = () => { setOpen(false); setQ(''); };
  const pick = (t: PickTeam) => { close(); onPick(t.id); };

  return (
    <span className={`relative inline-block ${className}`}>
      <input ref={inputRef} value={q} autoFocus={autoFocus} placeholder={placeholder} aria-label="Team: type a city, nickname or abbreviation"
        onFocus={show} onChange={(e) => { setQ(e.target.value); if (!open) show(); }}
        onBlur={() => { close(); onCancel?.(); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); const t = hits[active] ?? hits[0]; if (t) pick(t); }
          else if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        }}
        className="w-24 rounded-md border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-xs text-primary placeholder:text-primary/80 focus:border-primary focus:outline-none" />
      {open && createPortal(
        // A portal: inside the windowed list a transformed, scrolling ancestor would
        // offset a fixed popover and clip it.
        <ul role="listbox" style={{ position: 'fixed', top: pos.top, left: pos.left, transform: pos.up ? 'translateY(-100%)' : undefined }}
          className="z-50 max-h-72 w-56 overflow-auto rounded-md border border-border-strong bg-surface-1 py-1 shadow-xl">
          {hits.length === 0 && <li className="px-2 py-1 text-xs text-muted">No team matches</li>}
          {hits.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(t); }} onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-2 py-1 text-xs ${i === active ? 'bg-primary/20 text-neutral-100' : 'text-neutral-200'}`}>
              {t.logo ? <TeamLogo team={t.logo} size="sm" /> : <span className="inline-block w-5 text-center text-[11px] font-bold text-neutral-400">{t.abbr}</span>}
              <span className="truncate">{t.name}</span>
              <span className="ml-auto text-[11px] text-muted">{t.abbr}</span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </span>
  );
}
