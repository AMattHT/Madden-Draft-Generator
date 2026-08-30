import sharp from 'sharp';

/**
 * Comparable appearance features for a head-and-shoulders portrait.
 *
 * These are used to match a player's real headshot against Madden's generic
 * heads, so the two images are from completely different domains: a studio
 * photograph on one side, a game render on the other. Absolute brightness does
 * not survive that gap -- a rendered face is lit differently from a 1974 press
 * photo -- so every feature here is a RATIO against the player's own cheek
 * skin. Hair that is darker than its owner's face reads the same whether it was
 * photographed or rendered.
 */
export interface FaceFeatures {
  /** Mean luminance of the hair band over cheek luminance. <1 dark hair, ~1 bald/blond. */
  hairVsSkin: number;
  /** Fraction of the hair band that is not skin-coloured: hair coverage / hairline. */
  hairCoverage: number;
  /** Mean luminance of the jaw band over cheek luminance. <1 means facial hair. */
  jawVsCheek: number;
  /** Absolute cheek luminance, kept only as a weak tone tiebreaker. */
  cheekL: number;
}

const SIZE = 96;

function isSkin(r: number, g: number, b: number): boolean {
  return r > 60 && r > g && g > b * 0.5 && r - b > 10 && g > 30;
}

/** Sample a rectangle given in fractions of the image. */
function region(
  data: Buffer, w: number,
  x0: number, x1: number, y0: number, y1: number,
) {
  let sum = 0, n = 0, skin = 0;
  for (let y = Math.round(y0 * SIZE); y < Math.round(y1 * SIZE); y++) {
    for (let x = Math.round(x0 * SIZE); x < Math.round(x1 * SIZE); x++) {
      const i = (y * w + x) * 3;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      sum += (r + g + b) / 3;
      n++;
      if (isSkin(r, g, b)) skin++;
    }
  }
  return { mean: n ? sum / n : 0, skinFrac: n ? skin / n : 0, n };
}

/**
 * Extract features from a portrait PNG/JPEG buffer.
 *
 * Bands are chosen for a head-and-shoulders crop with the face centred, which
 * is what both Madden's generic head portraits and the retro-disc headshots
 * are. A photo framed very differently (an action shot) will produce garbage,
 * which is why the caller prefers the retro pack over an arbitrary web image.
 */
export async function extractFaceFeatures(buf: Buffer): Promise<FaceFeatures | null> {
  try {
    const { data, info } = await sharp(buf)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const cheek = region(data, w, 0.34, 0.66, 0.40, 0.56); // mid-face, reliably skin
    if (!cheek.n || cheek.mean < 8) return null; // black/blank image
    const hair = region(data, w, 0.30, 0.70, 0.06, 0.26); // above the brow
    const jaw = region(data, w, 0.34, 0.66, 0.62, 0.78); // chin / moustache line
    const denom = Math.max(cheek.mean, 1);
    return {
      hairVsSkin: hair.mean / denom,
      hairCoverage: 1 - hair.skinFrac,
      jawVsCheek: jaw.mean / denom,
      cheekL: cheek.mean,
    };
  } catch {
    return null;
  }
}

/**
 * Distance between two faces. Hair dominates because it is the most visible
 * difference at thumbnail size and the most reliable to measure; the jaw band
 * (facial hair) matters about half as much; absolute tone is a weak tiebreaker
 * only, since the tone pool has already constrained it.
 */
export function faceDistance(a: FaceFeatures, b: FaceFeatures): number {
  const hair = (a.hairVsSkin - b.hairVsSkin) ** 2 * 3;
  const cover = (a.hairCoverage - b.hairCoverage) ** 2 * 2;
  const jaw = (a.jawVsCheek - b.jawVsCheek) ** 2 * 1.5;
  const tone = ((a.cheekL - b.cheekL) / 255) ** 2 * 0.25;
  return hair + cover + jaw + tone;
}
