import { unzipSync, strFromU8 } from 'fflate';

/**
 * Minimal .xlsx reader: the first worksheet as a header row plus string rows.
 * An xlsx is a zip of XML; this resolves shared strings and inline strings and
 * ignores styles, formulas and every other sheet. Enough for a ratings export.
 */
export function readFirstSheet(buf: Uint8Array): { headers: string[]; rows: string[][] } {
  const files = unzipSync(buf);
  const shared: string[] = [];
  const ssXml = files['xl/sharedStrings.xml'];
  if (ssXml) {
    for (const si of strFromU8(ssXml).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join(''));
    }
  }
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) return { headers: [], rows: [] };
  const xml = strFromU8(files[sheetName]);
  const table: string[][] = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? '';
      const col = colIndex(ref);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (type === 's' && v != null) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
      else if (v != null) value = decode(v);
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    table.push(cells);
  }
  const [headers = [], ...rows] = table;
  return { headers: headers.map((h) => h.trim()), rows };
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}
