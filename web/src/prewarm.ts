import { api } from './api';
import { cache } from './cache';
import type { GameVersion } from './types';

/**
 * Quietly build the years the user is most likely to open next.
 *
 * A year the app has never generated takes a second or three; the same year
 * again takes about 35ms, because the result is cached. So the delay is only
 * ever paid once per year — and it is paid at exactly the wrong moment, while
 * someone is waiting to look at a class.
 *
 * Moving that work to just after a class has loaded costs the user nothing they
 * were waiting on, and makes stepping through years with the arrows feel
 * instant. It is deliberately modest: the two adjacent years, one at a time,
 * only after a pause, and abandoned the moment the user picks something else.
 */
interface PrewarmOpts {
  year: number;
  years: number[];
  league: string;
  mode: string;
  gameVersion: GameVersion;
  /** Called for each year that ends up cached, so the picker can mark it. */
  onCached?: (year: number) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Bumped on every schedule/cancel; a run in flight checks it and stops. */
let generation = 0;

/** Stop any pending or in-flight pre-warm (the user moved on). */
export function cancelPrewarm(): void {
  generation++;
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
}

export function schedulePrewarm(opts: PrewarmOpts): void {
  cancelPrewarm();
  const mine = generation;
  // Long enough that it never competes with the class being rendered right now.
  timer = setTimeout(() => {
    void run(opts, mine);
  }, 1500);
}

async function run(opts: PrewarmOpts, mine: number): Promise<void> {
  const { year, years, league, mode, gameVersion, onCached } = opts;
  // Forward first: stepping up through drafts is the common direction.
  const candidates = [year + 1, year - 1].filter((y) => years.includes(y));

  for (const y of candidates) {
    if (generation !== mine) return; // superseded
    try {
      if (await cache.get(y, league, mode)) continue; // already built
      if (generation !== mine) return;
      const live = await api.generated(y, league, mode, gameVersion);
      if (generation !== mine) return;
      // A degraded class was built before the data caches were ready; caching it
      // would pin a worse class than the user would get by asking again.
      if (live.degraded) continue;
      live.fetchedAt = Date.now();
      live.gameVersion = gameVersion;
      await cache.set(live, mode);
      onCached?.(y);
    } catch {
      // A pre-warm failing is not worth telling anyone about: the year is simply
      // built the slow way when it is actually opened.
      return;
    }
    // Breathe between years so a background task never owns the connection.
    await new Promise((r) => setTimeout(r, 400));
  }
}
