import path from 'path';
import fs from 'fs';

/**
 * Resolve the server root and data directories robustly across dev (tsx runs
 * from src/) and build (node runs from dist/). The `data/` folder lives at the
 * server root in both cases; we copy it into dist/ during build.
 */
function findDataRoot(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'data'), // src/config -> server/data (dev)
    path.resolve(__dirname, '..', '..', '..', 'data'), // dist/config -> server/data (build)
    path.resolve(process.cwd(), 'data'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export const DATA_ROOT = findDataRoot();
export const SERVER_ROOT = path.resolve(DATA_ROOT, '..');
export const LOOKUPS_DIR = path.join(DATA_ROOT, 'lookups');
export const TEMPLATES_DIR = path.join(DATA_ROOT, 'Templates');
export const FORMULAS_DIR = path.join(DATA_ROOT, 'formulas');
export const TEMPLATE_M26 = path.join(TEMPLATES_DIR, 'CAREERDRAFT-2026Template');
export const TEMPLATE_M27 = path.join(TEMPLATES_DIR, 'CAREERDRAFT-2027Template');

/** Madden 27 .mdc constants — 5876-byte blocks, uncompressed visual JSON. */
export const M27_BLOCK_SIZE = 5876;
export const M27_DATA_START = 0x46;

export const CACHE_DIR = path.join(SERVER_ROOT, 'cache');
export const CACHE_DB = path.join(CACHE_DIR, 'draft-cache.db');
export const EXPORTS_DIR = path.join(CACHE_DIR, 'exports');

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(EXPORTS_DIR, { recursive: true });

export const PORT = Number(process.env.PORT || 5174);

/** Madden 27 Saves directory (note: M27 uses lowercase 'saves'). */
export const M27_SAVES_DIR = process.env.MADDEN27_SAVES_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents', 'Madden NFL 27', 'saves');

/** Madden 26 .mdc constants — see [[mdc-m26-format-gotcha]]. */
export const MDC_BLOCK_SIZE = 4296;
export const MDC_DATA_START = 0x46;
