import fs from 'fs';
import Papa from 'papaparse';

/** Parse a CSV file into an array of row objects keyed by header. */
export function parseCsvFile<T = Record<string, string>>(filePath: string): T[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const result = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}

/** Normalize a player name for dedup/matching: lowercase, strip PFR markers,
 *  suffixes, accents, and punctuation. */
export function normalizeName(name: string | undefined | null): string {
  if (!name) return '';
  return String(name)
    .replace(/[‡†*^¤+]/g, '') // PFR HOF/ProBowl/compensatory markers
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '') // suffixes
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}
