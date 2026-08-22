/**
 * Shared ITA → Madden skin-tone (1–7) classifier.
 *
 * Official game draft classes do NOT store a skinTone field — they pick a
 * generic head `gen_N_…` and the body inherits N. Our job is to pick N.
 *
 * The original detector used a tight YCbCr "Caucasian skin" box (Cr 133–177,
 * r > 30). That systematically samples forehead highlights on darker faces and
 * classifies Black players as tone 2–4 (Charles Rogers, Leftwich, Tillman…).
 * Pass 1 keeps the tight box; pass 2 relaxes it so Fitzpatrick V–VI pixels
 * count. Dark ITA readings are trusted more than light ones.
 */

export function rgbToITA([r, g, b]: number[]): number {
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const L = 116 * f(Y) - 16;
  const bb = 200 * (f(Y) - f(Z));
  return (Math.atan2(L - 50, bb) * 180) / Math.PI;
}

/** ITA of a studio-lit Madden/wiki portrait → generic tone 1 (lightest) … 7 (darkest). */
export function itaToTone(v: number): number {
  if (v >= 28) return 1;
  if (v >= 10) return 2;
  if (v >= -5) return 3;
  if (v >= -18) return 4;
  if (v >= -32) return 5;
  if (v >= -45) return 6;
  return 7;
}

export interface SkinSampleOpts {
  /** Inclusive row/col fractions of the image to sample (face box). */
  y0?: number; y1?: number; x0?: number; x1?: number;
  minPixels?: number;
}

/**
 * Median ITA of skin-like pixels in a raw RGB(A) buffer.
 * Tries a tight chroma box first, then a relaxed box for darker skin.
 */
export function sampleSkinITA(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
  opts: SkinSampleOpts = {}
): number | null {
  const y0 = Math.floor((opts.y0 ?? 0.28) * height);
  const y1 = Math.floor((opts.y1 ?? 0.70) * height);
  const x0 = Math.floor((opts.x0 ?? 0.26) * width);
  const x1 = Math.floor((opts.x1 ?? 0.74) * width);
  const minPixels = opts.minPixels ?? 40;

  const collect = (loose: boolean): { r: number[]; g: number[]; b: number[] } => {
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    const cbMin = loose ? 68 : 77;
    const cbMax = loose ? 142 : 133;
    const crMin = loose ? 112 : 133;
    const crMax = loose ? 182 : 177;
    const rMin = loose ? 10 : 30;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * channels;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        if (Cb >= cbMin && Cb <= cbMax && Cr >= crMin && Cr <= crMax && r > rMin) {
          rs.push(r); gs.push(g); bs.push(b);
        }
      }
    }
    return { r: rs, g: gs, b: bs };
  };

  let s = collect(false);
  if (s.r.length < minPixels) s = collect(true);
  if (s.r.length < minPixels) return null;
  const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return rgbToITA([med(s.r), med(s.g), med(s.b)]);
}

export function itaSampleToTone(ita: number | null): number | null {
  return ita == null ? null : itaToTone(ita);
}

/**
 * Combine portrait-derived / wiki / CSV / position-prior tones.
 * Dark ITA readings are trusted (the old detector almost never produced them
 * by accident). When sources conflict, lean darker rather than lighter.
 */
export function resolveSkinTone(opts: {
  derived?: number | null;
  wiki?: number | null;
  trustedCsv?: number | null;
  fallback: number;
}): number {
  const clamp = (n: number) => Math.max(1, Math.min(7, Math.round(n)));
  const derived = opts.derived != null ? clamp(opts.derived) : null;
  const wiki = opts.wiki != null ? clamp(opts.wiki) : null;
  const trusted = opts.trustedCsv != null ? clamp(opts.trustedCsv) : null;

  if (derived != null && derived >= 6) return derived;
  if (wiki != null && wiki >= 6) return wiki;

  if (derived != null && wiki != null) {
    if (Math.abs(derived - wiki) <= 1) return Math.max(derived, wiki);
    return Math.max(derived, wiki);
  }
  if (derived != null) return derived;
  if (wiki != null) return wiki;
  if (trusted != null) return trusted;
  return clamp(opts.fallback);
}
