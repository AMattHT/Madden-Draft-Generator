import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { AppView } from '../App';
import type { GameVersion } from '../types';
import type { EditTools, ExportActions } from './ExportMenu';

type Mode = 'madden' | 'retro' | 'launch';

type Item =
  | { kind: 'item'; label: string; hint?: string; checked?: boolean; disabled?: boolean; onSelect: () => void }
  | { kind: 'sep' }
  | { kind: 'label'; label: string };

interface Menu { id: string; label: string; items: Item[] }

const RELEASES_URL = 'https://github.com/AMattHT/Madden-Draft-Generator/releases/latest';
const ISSUES_URL = 'https://github.com/AMattHT/Madden-Draft-Generator/issues/new';

/**
 * A classic menu bar (File · View · Help) above the toolbar. Actions that used to
 * be loose buttons in the top bar live here: creating and opening classes, the
 * view and game switches, the rating lens, and What's new.
 */
export function MenuBar({
  onCreateClass,
  onOpenClass,
  onWhatsNew,
  view,
  onSetView,
  franchiseEnabled,
  gameVersion,
  onSetGameVersion,
  pinnedGame,
  mode,
  onSetMode,
  version,
  hasClass,
  exportActions,
  editTools,
}: {
  onCreateClass: () => void;
  onOpenClass: () => void;
  onWhatsNew: () => void;
  view: AppView;
  onSetView: (v: AppView) => void;
  franchiseEnabled: boolean;
  gameVersion: GameVersion;
  onSetGameVersion: (v: GameVersion) => void;
  pinnedGame?: GameVersion | null;
  mode: Mode;
  onSetMode: (m: Mode) => void;
  version?: string | null;
  /** A class is on the board (the save / export items need one). */
  hasClass: boolean;
  /** The open class's export actions (filled by ExportMenu). */
  exportActions: MutableRefObject<ExportActions | null>;
  editTools?: EditTools;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const external = (url: string) => () => window.open(url, '_blank', 'noopener');

  const act = (fn: (a: ExportActions) => void) => () => { const a = exportActions.current; if (a) fn(a); };
  const noClass = !hasClass;
  const a = exportActions.current;
  const menus: Menu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { kind: 'item', label: 'Create class…', hint: 'Class Studio', onSelect: onCreateClass },
        { kind: 'item', label: 'Open a draft class…', hint: '.mdc', onSelect: onOpenClass },
        { kind: 'sep' },
        { kind: 'item', label: 'Save as a draft class…', hint: 'download .mdc', disabled: noClass, onSelect: act((x) => x.downloadMdc()) },
        { kind: 'item', label: a?.isFile ? 'Save back to Madden Saves folder' : 'Save to Madden Saves folder', disabled: noClass, onSelect: act((x) => x.saveToSaves()) },
        { kind: 'item', label: 'Export as a CSV…', hint: 'all attributes', disabled: noClass, onSelect: act((x) => x.downloadCsv()) },
        { kind: 'item', label: 'Build 2D portrait pack…', hint: 'PFR / Wikipedia', disabled: noClass || !a?.canBuildPortraits, onSelect: act((x) => x.buildPortraits()) },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { kind: 'item', label: 'Undo', hint: 'Ctrl+Z', disabled: noClass || !editTools, onSelect: () => editTools?.undo() },
        { kind: 'item', label: 'Redo', hint: 'Ctrl+Shift+Z', disabled: noClass || !editTools, onSelect: () => editTools?.redo() },
        { kind: 'sep' },
        { kind: 'item', label: 'Export edits (.json)…', hint: a?.editedCount ? String(a.editedCount) : undefined, disabled: noClass || !a?.editedCount, onSelect: act((x) => x.exportEditsJson()) },
        { kind: 'item', label: 'Import edits (.json)…', disabled: noClass, onSelect: act((x) => x.importEditsPick()) },
        { kind: 'sep' },
        { kind: 'item', label: 'Clear all edits for this class', disabled: noClass || !a?.editedCount, onSelect: act((x) => x.clearAllEdits()) },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { kind: 'item', label: 'Draft classes', checked: view === 'draft', onSelect: () => onSetView('draft') },
        ...(franchiseEnabled ? [{ kind: 'item', label: 'Franchise tools', checked: view === 'franchise', onSelect: () => onSetView('franchise') } as Item] : []),
        { kind: 'sep' },
        { kind: 'label', label: 'Game' },
        { kind: 'item', label: 'Madden 26', checked: gameVersion === 'm26', disabled: pinnedGame === 'm27', onSelect: () => onSetGameVersion('m26') },
        { kind: 'item', label: 'Madden 27', checked: gameVersion === 'm27', disabled: pinnedGame === 'm26', onSelect: () => onSetGameVersion('m27') },
        { kind: 'sep' },
        { kind: 'label', label: 'Rating lens' },
        { kind: 'item', label: 'Launch day ratings', checked: mode === 'launch', onSelect: () => onSetMode('launch') },
        { kind: 'item', label: 'Realistic', checked: mode === 'madden', onSelect: () => onSetMode('madden') },
        { kind: 'item', label: 'Career', checked: mode === 'retro', onSelect: () => onSetMode('retro') },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { kind: 'item', label: "What's new…", onSelect: onWhatsNew },
        { kind: 'item', label: 'Releases on GitHub', onSelect: external(RELEASES_URL) },
        { kind: 'item', label: 'Report an issue', onSelect: external(ISSUES_URL) },
        { kind: 'sep' },
        { kind: 'label', label: version ? `Madden Draft Toolkit ${version}` : 'Madden Draft Toolkit' },
      ],
    },
  ];

  return (
    <div ref={rootRef} className="relative z-40 flex h-7 shrink-0 items-stretch border-b border-border bg-surface-1 px-2 text-xs text-neutral-300 select-none">
      {menus.map((m) => (
        <div key={m.id} className="relative flex">
          <button
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => { if (open && open !== m.id) setOpen(m.id); }}
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            className={`px-2.5 transition-colors ${open === m.id ? 'bg-surface-3 text-neutral-100' : 'hover:bg-surface-2 hover:text-neutral-100'}`}
          >
            {m.label}
          </button>
          {open === m.id && (
            <div role="menu" className="absolute left-0 top-full z-50 mt-px min-w-[280px] whitespace-nowrap overflow-hidden rounded-b-md border border-border-strong bg-surface-1 py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
              {m.items.map((it, i) => {
                if (it.kind === 'sep') return <div key={i} className="my-1 border-t border-border" />;
                if (it.kind === 'label') return <div key={i} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{it.label}</div>;
                return (
                  <button
                    key={i}
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => { setOpen(null); it.onSelect(); }}
                    className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs text-neutral-200 transition-colors hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <span className="w-3 text-primary-light">{it.checked ? '✓' : ''}</span>
                    <span className="flex-1">{it.label}</span>
                    {it.hint && <span className="text-[10px] text-muted">{it.hint}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
