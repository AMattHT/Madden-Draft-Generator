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
export interface SkinSample {
  ita: number;
  /** 'tight' = the Caucasian-skin chroma box matched (light/medium skin);
   *  'loose' = only the relaxed box matched (darker skin). */
  pass: 'tight' | 'loose';
  pixels: number;
}

/** Median ITA of skin-like pixels plus WHICH chroma box matched — the box is as
 *  informative as the angle, because portrait lighting shifts ITA by 20-30 degrees
 *  while a tanned white face still fills the tight box and a dark face never does. */
export function sampleSkin(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
  opts: SkinSampleOpts = {}
): SkinSample | null {
  const ita = sampleSkinITA(data, width, height, channels, opts);
  if (ita == null) return null;
  return { ita, pass: lastPass, pixels: lastPixels };
}
let lastPass: 'tight' | 'loose' = 'tight';
let lastPixels = 0;

/** Median skin RGB (same sampling as sampleSkinITA), for diagnostics and L*-aware tones. */
export function sampleSkinRGB(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
  opts: SkinSampleOpts = {}
): [number, number, number] | null {
  const ita = sampleSkinITA(data, width, height, channels, opts);
  return ita == null ? null : lastRGB;
}
let lastRGB: [number, number, number] = [0, 0, 0];

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
  lastPass = 'tight';
  if (s.r.length < minPixels) { s = collect(true); lastPass = 'loose'; }
  lastPixels = s.r.length;
  if (s.r.length < minPixels) return null;
  const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const r = med(s.r), g = med(s.g), b = med(s.b);
  lastRGB = [r, g, b];
  // Greyscale / near-neutral portraits (old legend photos) sit at the centre of the
  // loose chroma box; their ITA is +-90 on a hair of blue and reads as dark skin.
  // No chroma = no skin evidence: let the waterfall fall through to other sources.
  const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (Math.hypot(Cb - 128, Cr - 128) < 9) return null;
  const ita = rgbToITA([r, g, b]);
  // Real skin always has a positive b* (yellow), so ITA lives within about -75..+60.
  // Anything beyond is a tinted greyscale print, not a complexion.
  if (ita < -75 || ita > 70) return null;
  return ita;
}

/** Tone from a sample, using the chroma box that matched as a guard: a face that
 *  filled the tight (Caucasian) box is never darker than tone 4 whatever the
 *  lighting did to its angle; a face that only the loose box caught is never
 *  lighter than tone 4. */
export function sampleToTone(sample: SkinSample): number {
  const t = itaToTone(sample.ita);
  if (sample.pass === 'tight') return Math.min(4, t);
  return Math.max(4, t);
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
  /** Share of Black players in the player's era (SkinToneService.eraDarkShare). */
  eraDarkShare?: number;
}): number {
  const clamp = (n: number) => Math.max(1, Math.min(7, Math.round(n)));
  let derived = opts.derived != null ? clamp(opts.derived) : null;
  const wiki = opts.wiki != null ? clamp(opts.wiki) : null;
  const trusted = opts.trustedCsv != null ? clamp(opts.trustedCsv) : null;

  // Old legend portraits are underexposed: a tanned white face from the 1960s
  // samples as dark as a modern medium-brown one (Namath reads like Lamar
  // Jackson). A 5-6 reading is ambiguous; when the era was overwhelmingly white
  // and the record says White, read it as the tanned end of light instead.
  const era = opts.eraDarkShare ?? 0.66;
  if (derived != null && derived >= 5 && derived <= 6 && ((era < 0.3 && trusted === 1) || era < 0.05)) derived = 4;

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

/**
 * Calibrated classifier (22 Aug 2026). Ground truth: EA's own fallback generic
 * head (gen_<tone>_…) for 2,549 real players on the M26/M27 career rosters, read
 * against their menu portraits. Median ITA of skin pixels in a tight cheek/nose
 * window (rows 40-66%, cols 36-64% of the 256px crop — the old 28-74% box was
 * mostly hair on Namath) separates the tones monotonically; tones 1 and 2 are
 * indistinguishable even to EA. Per-tone Gaussians below; held-out: 56% exact
 * (1/2 merged), 81% within one tone, 3.6% light<->dark swaps (old sampler: 36% /
 * 24% off by 2+).
 */
export const TONE_ITA_MODEL: Record<number, [number, number]> = {
  1: [33.5, 15.9], 2: [32.4, 17.4], 3: [18.6, 19.3], 4: [10.6, 21.5], 5: [-5.6, 19.7], 6: [-23.7, 20.7], 7: [-36.0, 18.7],
};

/** Median ITA of skin pixels in the calibrated face window (see TONE_ITA_MODEL).
 *  Neutral pixels (background, white jersey, grey) and very dark ones (hair,
 *  shadow) are excluded; null when fewer than `minPixels` skin pixels remain. */
export function sampleSkinITATight(data: Buffer | Uint8Array, width: number, height: number, channels: number, minPixels = 40): number | null {
  const y0 = Math.floor(0.40 * height), y1 = Math.floor(0.66 * height);
  const x0 = Math.floor(0.36 * width), x1 = Math.floor(0.64 * width);
  const Ls: number[] = [], Bs: number[] = [];
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * channels;
      if (channels >= 4 && data[i + 3] < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (Math.hypot(Cb - 128, Cr - 128) < 12) continue;
      if (Cb < 68 || Cb > 142 || Cr < 125 || Cr > 182) continue;
      const R = lin(r), G = lin(g), B = lin(b);
      const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
      const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
      const L = 116 * f(Y) - 16;
      if (L < 12) continue;
      Ls.push(L); Bs.push(200 * (f(Y) - f(Z)));
    }
  }
  if (Ls.length < minPixels) return null;
  Ls.sort((a, b) => a - b); Bs.sort((a, b) => a - b);
  const L = Ls[Ls.length >> 1], bb = Bs[Bs.length >> 1];
  return (Math.atan2(L - 50, bb) * 180) / Math.PI;
}

export interface ToneEvidence {
  /** Median ITA from the player's Madden portrait (sampleSkinITATight). */
  ita?: number | null;
  /** The portrait is a plpo_legends_* image — often a scanned vintage photo whose
   *  exposure is unreliable (Namath reads as dark): likelihood tempered 2x. */
  legendPortrait?: boolean;
  /** Tone read from a Wikipedia photo with the old sampler (weak evidence). */
  wikiTone?: number | null;
  /** Explicit non-default CSV race (1-6); mild evidence. */
  trustedCsv?: number | null;
  /** P(tone) for the position and era (SkinToneService.toneDistribution). */
  prior: Record<number, number>;
}

/** Argmax posterior tone over 1..7: prior x portrait likelihood x wiki x CSV. */
export function toneFromEvidence(e: ToneEvidence): number {
  let best = 0, bestScore = -Infinity;
  const k = e.legendPortrait ? 2 : 1;
  // A modern studio portrait is decent evidence (held-out sd ~18 deg): the
  // position prior only gets half weight against it (a 2011 QB prior of 58% tone 2
  // must not outvote Cam Newton's own face). Vintage legend photos keep the full prior.
  const priorWeight = e.ita != null && !e.legendPortrait ? 0.5 : 1;
  for (let t = 1; t <= 7; t++) {
    let ll = priorWeight * Math.log(Math.max(0.03, e.prior[t] ?? 0));
    if (e.ita != null) {
      const [mu, sd0] = TONE_ITA_MODEL[t];
      const sd = sd0 * k;
      ll += -0.5 * ((e.ita - mu) / sd) ** 2 - Math.log(sd);
    }
    if (e.wikiTone != null) ll += -0.5 * ((e.wikiTone - t) / 1.8) ** 2;
    if (e.trustedCsv != null) ll += (e.trustedCsv <= 3) === (t <= 3) ? Math.log(2) : Math.log(0.5);
    if (ll > bestScore) { bestScore = ll; best = t; }
  }
  return best || 4;
}
