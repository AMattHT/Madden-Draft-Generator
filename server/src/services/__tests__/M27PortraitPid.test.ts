import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { LOOKUPS_DIR } from '../../config/paths';
import { PlayerLookupService } from '../PlayerLookupService';
import { DraftClassBuilder } from '../DraftClassBuilder';

/**
 * The PID written into an M27 class indexes the GAME's portrait table. An id
 * the game does not have is not ignored and is not a generic -- it draws a
 * blank NFL shield, which is the most visible way a class can be wrong.
 *
 * A change once sourced this from the lookup's PhotoID, guarded by
 * PortraitService, and shipped. That guard answers "do WE hold the portrait
 * art", not "does MADDEN 27 have this id", so classes came back full of blank
 * shields: Cam Newton's 4439 is not in M27 at all. The right check is
 * LikenessService.portraitFor, which consults the catalog for the game version
 * being written.
 *
 * This test holds the line by measuring against the game's own catalogs rather
 * than against ours.
 */

const json = (f: string) => JSON.parse(fs.readFileSync(path.join(LOOKUPS_DIR, f), 'utf8'));

/** Every portrait id Madden 27 is known to ship, from the game's own files. */
function shippedPids(): { pids: Set<number>; names: Set<string> } {
  const m27 = json('face-assets-by-game.json').m27;
  const roster = json('m27-face-assets.json').players as Record<string, { portraitPid?: number }>;
  const pids = new Set<number>();
  for (const v of Object.values(roster)) if (v.portraitPid) pids.add(v.portraitPid);
  for (const p of Object.values(m27.legendPids as Record<string, number>)) pids.add(p);
  for (const p of Object.values((json('m27-field-stats.json').headPid ?? {}) as Record<string, number>)) pids.add(p);
  // The game's own generic-head items (exported from its FootballCharacterHeadItem
  // assets): every head it ships with its portrait id.
  for (const h of Object.values((json('m27-generic-head-items.json').heads ?? {}) as Record<string, { pid: number }>)) if (h.pid) pids.add(h.pid);
  // Players the game keeps a portrait for by name; portraitFor is allowed to
  // use the lookup's PhotoID for exactly these.
  const names = new Set<string>((m27.playerPortraits as string[]) ?? []);
  return { pids, names };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

test('no M27 class writes a portrait id the game does not have', () => {
  const { pids, names } = shippedPids();
  assert.ok(pids.size > 1000, 'the M27 portrait catalogs should have loaded');

  for (const year of [2007, 2011, 2019]) {
    const players = PlayerLookupService.byYear(year);
    if (!players.length) continue;
    const { buffer } = DraftClassBuilder.buildMdc27(players, undefined, 'madden');
    assert.ok(buffer.length > 0);

    // Re-parse rather than trusting the in-memory prospects: the bytes are what
    // Madden reads.
    const { Mdc27Service } = require('../Mdc27Service') as typeof import('../Mdc27Service');
    const parsed = Mdc27Service.parse(buffer);
    const unknown = parsed.filter((p) => {
      const pid = Number((p as { PID?: number }).PID) || 0;
      if (!pid) return false; // 0 is "no portrait", which the game handles
      if (pids.has(pid)) return false;
      const f = norm(String((p as { firstName?: string }).firstName ?? ''));
      const l = norm(String((p as { lastName?: string }).lastName ?? ''));
      return !(names.has(l + f) || names.has(f + l));
    });
    // Measured, not guessed: a correct build leaves at most 7 here (the
    // name-keyed path, which the pid sets cannot confirm), and the regression
    // put 28 in the 2011 class. 15 sits clear of the first and well under the
    // second -- verified by reintroducing the bug and watching this fail.
    assert.ok(
      unknown.length <= 15,
      `${year}: ${unknown.length} players carry a portrait id M27 has no record of ` +
        `(e.g. ${unknown.slice(0, 3).map((p) => `${(p as { lastName?: string }).lastName}:${(p as { PID?: number }).PID}`).join(', ')})`
    );
  }
});
