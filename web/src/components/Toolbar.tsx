import { Icon, ICONS } from './ui';

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
  unverified = false,
  setUnverified,
  unverifiedCount = 0,
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
  /** Likeness review: show only generic faces whose skin tone is an unverified guess. */
  unverified?: boolean;
  setUnverified?: (b: boolean) => void;
  unverifiedCount?: number;
}) {
  const select =
    'rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-300 focus:border-primary focus:outline-none';
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-border bg-surface-1 px-4 py-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
          <Icon path={ICONS.search} className="h-4 w-4" />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="w-56 rounded-md border border-border bg-surface-0 py-1.5 pl-8 pr-7 text-sm text-neutral-200 placeholder:text-muted focus:border-primary focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-neutral-200"
            aria-label="Clear search"
          >
            <Icon path={ICONS.close} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <select value={pos} onChange={(e) => setPos(e.target.value)} className={select}>
        {/* `pos` can be a group code chosen from the composition strip that isn't in
            the exact-label list — surface it so the dropdown stays in sync. */}
        {(positions.includes(pos) ? positions : [...positions, pos]).map((p) => (
          <option key={p} value={p}>
            {p === 'ALL' ? 'All positions' : p}
          </option>
        ))}
      </select>

      <select value={sort.replace(/^-/, '')} onChange={(e) => {
        const id = e.target.value;
        setSort(id === 'ovr' || id === 'wav' || id === 'dev' ? `-${id}` : id);
      }} className={select}>
        <option value="pick">Sort: Draft order</option>
        <option value="team">Sort: Team</option>
        <option value="name">Sort: Name</option>
        <option value="pos">Sort: Position</option>
        {spoilers && <option value="ovr">Sort: OVR</option>}
        {spoilers && <option value="dev">Sort: Dev</option>}
        {spoilers && <option value="wav">Sort: wAV</option>}
        <option value="face">Sort: Face</option>
      </select>

      <label
        className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-300"
        title="Off: overall, dev trait and attributes are hidden so you can scout the class blind"
      >
        <input
          type="checkbox"
          checked={spoilers}
          onChange={(e) => setSpoilers(e.target.checked)}
          className="h-3.5 w-3.5 accent-primary"
        />
        Spoilers
      </label>

      {setUnverified && (
        <label
          className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${unverified ? 'border-gold/50 bg-gold/10 text-gold' : 'border-border bg-surface-0 text-neutral-300'}`}
          title="Generic faces whose skin tone has no photo behind it (a position/era guess) and no fix from you yet. Each row shows his real photo so you can check it at a glance."
        >
          <input
            type="checkbox"
            checked={unverified}
            onChange={(e) => setUnverified(e.target.checked)}
            className="h-3.5 w-3.5 accent-gold"
          />
          Unverified faces <span className="tabular-nums text-xs text-muted">{unverifiedCount}</span>
        </label>
      )}

      <span className="ml-auto text-xs tabular-nums text-muted">
        <span className="font-semibold text-neutral-300">{shown}</span> of {total}
      </span>
    </div>
  );
}
