/** Madden save name fragment for a user-named class: letters and digits only,
 *  upper-cased, at most 16 characters, so several custom classes coexist in the
 *  Saves folder as CAREERDRAFT-<SLUG>. */
export function classSlug(name: string): string {
  const s = String(name ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
  return s || 'CUSTOM';
}
