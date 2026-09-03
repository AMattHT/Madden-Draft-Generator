/**
 * A photo from a request body: `imageBase64` (data URL or bare base64) or
 * `imageUrl` (http/https). Shared by the gear-from-photo and tone-from-photo
 * routes. Throws a PhotoInputError carrying the HTTP status to answer with.
 */
export class PhotoInputError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function readPhotoInput(body: { imageBase64?: unknown; imageUrl?: unknown } | undefined): Promise<Buffer> {
  let buf: Buffer | null = null;
  const b64 = String(body?.imageBase64 || '');
  const url = String(body?.imageUrl || '');
  if (b64) {
    const raw = b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    try { buf = Buffer.from(raw, 'base64'); } catch { buf = null; }
  } else if (url) {
    let target: URL;
    try { target = new URL(url); } catch { throw new PhotoInputError(400, 'that is not a valid URL'); }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new PhotoInputError(400, 'URL must be http(s)');
    try {
      const upstream = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MaddenDraftClassGenerator/0.1',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      if (!upstream.ok) throw new PhotoInputError(502, `image URL returned HTTP ${upstream.status}`);
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        throw new PhotoInputError(400, 'that URL is a web page, not an image — right-click the photo and copy image address');
      }
      buf = Buffer.from(await upstream.arrayBuffer());
    } catch (e) {
      if (e instanceof PhotoInputError) throw e;
      buf = null;
    }
  }
  if (!buf || buf.length < 800) throw new PhotoInputError(400, 'need a photo (upload or url)');
  return buf;
}
