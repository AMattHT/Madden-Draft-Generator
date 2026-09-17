import { Icon, ICONS, Segmented, Switch } from './ui';

export type BoardView = 'table' | 'cards' | 'board';
export type ColumnPreset = 'core' | 'physical' | 'position' | 'all';

/** Board controls: search, position, sort, the spoilers switch, the view set
 *  (table / cards / draft board) and, on the table, which attribute columns show. */
export function Toolbar({
  search,
  setSearch,
  pos,
  setPos,
  positions,
  sort,
  setSort,
  shown,
  total,
  spoilers,
  setSpoilers,
  view,
  setView,
  columns,
  setColumns,
}: {
  search: string;
  setSearch: (s: string) => void;
  pos: string;
  setPos: (s: string) => void;
  positions: string[];
  sort: string;
  setSort: (s: string) => void;
  shown: number;
  total: number;
  spoilers: boolean;
  setSpoilers: (b: boolean) => void;
  view: BoardView;
  setView: (v: BoardView) => void;
  columns: ColumnPreset;
  setColumns: (c: ColumnPreset) => void;
}) {
  const select =
    'h-8 rounded-lg border border-white/[0.07] bg-black/30 pl-2.5 text-xs font-medium text-neutral-200 transition-colors hover:border-white/[0.14] focus:border-primary focus:outline-none';
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.05] bg-surface-1/60 px-3 py-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
          <Icon path={ICONS.search} className="h-3.5 w-3.5" />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="h-8 w-52 rounded-lg border border-white/[0.07] bg-black/30 pl-8 pr-7 text-xs text-neutral-100 transition-all placeholder:text-muted hover:border-white/[0.14] focus:w-64 focus:border-primary focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-neutral-200"
            aria-label="Clear search"
          >
            <Icon path={ICONS.close} className="h-3 w-3" />
          </button>
        )}
      </div>

      <select value={pos} onChange={(e) => setPos(e.target.value)} className={select} aria-label="Position">
        {/* `pos` can be a group code chosen from the composition strip that isn't in
            the exact-label list — surface it so the dropdown stays in sync. */}
        {(positions.includes(pos) ? positions : [...positions, pos]).map((p) => (
          <option key={p} value={p}>
            {p === 'ALL' ? 'All positions' : p}
          </option>
        ))}
      </select>

      <select
        value={sort.replace(/^-/, '')}
        onChange={(e) => {
          const id = e.target.value;
          setSort(id === 'ovr' || id === 'wav' || id === 'dev' ? `-${id}` : id);
        }}
        className={select}
        aria-label="Sort"
      >
        <option value="pick">Draft order</option>
        <option value="team">Team</option>
        <option value="name">Name</option>
        <option value="pos">Position</option>
        {spoilers && <option value="ovr">Overall</option>}
        {spoilers && <option value="dev">Dev trait</option>}
        {spoilers && <option value="wav">Career value</option>}
        <option value="face">Face</option>
      </select>

      <Switch
        checked={spoilers}
        onChange={setSpoilers}
        label={
          <span className="inline-flex items-center gap-1.5">
            <Icon path={spoilers ? ICONS.eye : ICONS.eyeOff} className="h-3.5 w-3.5" />
            Spoilers
          </span>
        }
        title="Off: overall, dev trait and attributes are hidden so you can scout the class blind"
        className="ml-1 h-8 rounded-lg border border-white/[0.07] bg-black/30 px-2.5"
      />

      <span className="ml-auto flex items-center gap-2">
        {view === 'table' && (
          <Segmented<ColumnPreset>
            size="xs"
            label="Attribute columns"
            value={columns}
            onChange={setColumns}
            options={[
              { value: 'core', label: 'Core', title: 'Pick, team, player, position, overall, dev, career value' },
              { value: 'physical', label: 'Physical', title: 'Core plus the ten general/physical ratings' },
              { value: 'position', label: 'Position', title: 'Core plus the signature ratings for the position (or position filter)' },
              { value: 'all', label: 'All 54', title: 'Every rating the game carries' },
            ]}
          />
        )}
        <Segmented<BoardView>
          size="xs"
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'table', label: <Icon path={ICONS.table} className="h-3.5 w-3.5" />, title: 'Table' },
            { value: 'cards', label: <Icon path={ICONS.grid} className="h-3.5 w-3.5" />, title: 'Cards' },
            { value: 'board', label: <Icon path={ICONS.kanban} className="h-3.5 w-3.5" />, title: 'Draft board by round' },
          ]}
        />
        <span className="ml-1 text-[11px] tabular-nums text-muted">
          <span className="font-semibold text-neutral-200">{shown}</span> / {total}
        </span>
      </span>
    </div>
  );
}
