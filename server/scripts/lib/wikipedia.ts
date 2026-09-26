import fs from 'fs';
import path from 'path';
import { CACHE_DIR } from '../../src/config/paths';

const UA = 'MaddenDraftClassGenerator/1.1 (personal modding tool)';

/** A Wikipedia page's rendered HTML through the parse API, cached for a day. */
export async function wikiPageHtml(page: string): Promise<string> {
  const cached = path.join(CACHE_DIR, `wiki_${page}.html`);
  if (fs.existsSync(cached) && Date.now() - fs.statSync(cached).mtimeMs < 24 * 3600e3) return fs.readFileSync(cached, 'utf8');
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`wikipedia ${page}: HTTP ${res.status}`);
  const json = (await res.json()) as { parse?: { text?: string }; error?: { info?: string } };
  if (json.error || !json.parse?.text) throw new Error(`wikipedia ${page}: ${json.error?.info ?? 'no text'}`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, json.parse.text);
  return json.parse.text;
}
