import sharp from 'sharp';

const UA = 'MaddenDraftClassGenerator/0.1 (personal modding tool)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with retry/backoff on rate-limit (429) and transient 5xx. */
async function fetchWithRetry(url: string, attempts = 4): Promise<Buffer> {
  let lastErr = '';
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    lastErr = `HTTP ${res.status}`;
    if (res.status !== 429 && res.status < 500) break; // not retryable
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    await sleep(retryAfter * 1000 || 600 * (i + 1));
  }
  throw new Error(lastErr || 'fetch failed');
}

/** Download a real player photo and face-crop it to a square portrait PNG that
 *  Frosty can import as a texture replacement. */
export const PortraitFetchService = {
  async fetchPortraitPng(url: string, size = 256): Promise<Buffer> {
    const input = await fetchWithRetry(url);
    // `attention` focuses the square crop on the most salient region (the face).
    return sharp(input)
      .resize(size, size, { fit: 'cover', position: sharp.strategy.attention })
      .png()
      .toBuffer();
  },
};
