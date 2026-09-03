import { Router } from 'express';
import sharp from 'sharp';
import { LikenessOverrideService, validateLikenessPatch } from '../services/LikenessOverrideService';
import { readPhotoInput, PhotoInputError } from '../util/photoInput';
import { isGreyscale, itaToTone, sampleGreyL, sampleSkinITA, toneFromEvidence } from '../services/SkinToneClassify';
import { SkinToneService } from '../services/SkinToneService';
import { extractFaceFeatures } from '../services/FaceFeatures';
import { LikenessService } from '../services/LikenessService';

const r = Router();

/** Every likeness fix the user has recorded. */
r.get('/likeness/overrides', (_req, res) => {
  res.json({ overrides: LikenessOverrideService.all(), stamp: LikenessOverrideService.stamp() });
});

/** The overrides file itself, for sharing or promoting into the shipped data. */
r.get('/likeness/overrides/export', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="likeness-overrides.json"');
  res.send(LikenessOverrideService.exportJson());
});

function who(body: Record<string, unknown> | undefined): { first: string; last: string; year: number } | null {
  const first = String(body?.firstName ?? body?.first ?? '').trim();
  const last = String(body?.lastName ?? body?.last ?? '').trim();
  const year = parseInt(String(body?.draftYear ?? ''), 10);
  if (!first || !last || !Number.isFinite(year)) return null;
  return { first, last, year };
}

/** Record a fix: { firstName, lastName, draftYear, skinTone?, faceAsset?, bodyType?, note? }. */
r.put('/likeness/overrides', (req, res) => {
  const w = who(req.body);
  if (!w) return res.status(400).json({ error: 'firstName, lastName and draftYear are required' });
  const b = req.body as { skinTone?: unknown; faceAsset?: unknown; bodyType?: unknown; note?: unknown };
  const patch = {
    skinTone: b.skinTone == null || b.skinTone === '' ? undefined : Number(b.skinTone),
    faceAsset: b.faceAsset === undefined ? undefined : (b.faceAsset == null ? null : String(b.faceAsset)),
    bodyType: b.bodyType == null || b.bodyType === '' ? undefined : String(b.bodyType),
    note: b.note == null ? undefined : String(b.note),
  };
  const why = validateLikenessPatch(patch);
  if (why) return res.status(400).json({ error: why });
  const entry = LikenessOverrideService.set(w.first, w.last, w.year, patch);
  res.json({ override: entry, stamp: LikenessOverrideService.stamp() });
});

/** Undo a fix: { firstName, lastName, draftYear }. */
r.delete('/likeness/overrides', (req, res) => {
  const w = who(req.body);
  if (!w) return res.status(400).json({ error: 'firstName, lastName and draftYear are required' });
  const removed = LikenessOverrideService.remove(w.first, w.last, w.year);
  res.json({ removed, stamp: LikenessOverrideService.stamp() });
});

/**
 * Read a skin tone off a photo: { imageUrl | imageBase64, position?, draftYear?,
 * gameVersion? }. Samples the face the way the portrait pipeline does (median
 * skin ITA, or face L* for a black-and-white photo), weighs it against the
 * position/era prior, and ranks that tone's generic heads by hair and facial
 * hair when the photo yields features.
 */
r.post('/likeness/tone-from-photo', async (req, res) => {
  let buf: Buffer;
  try {
    buf = await readPhotoInput(req.body);
  } catch (e) {
    const pe = e as PhotoInputError;
    return res.status(pe.status || 400).json({ error: pe.message });
  }
  const b = req.body as { position?: unknown; draftYear?: unknown; gameVersion?: unknown };
  const gameVersion: 'm26' | 'm27' = b.gameVersion === 'm27' ? 'm27' : 'm26';
  const draftYear = Number.isFinite(Number(b.draftYear)) ? Number(b.draftYear) : 2015;
  let data: Buffer, width: number, height: number, channels: number;
  try {
    const out = await sharp(buf).rotate().resize({ width: 512, withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    data = out.data; width = out.info.width; height = out.info.height; channels = out.info.channels;
  } catch {
    return res.status(400).json({ error: 'could not decode that image' });
  }
  const grey = isGreyscale(data, width, height, channels);
  const ita = grey ? null : sampleSkinITA(data, width, height, channels);
  const greyL = grey ? sampleGreyL(data, width, height, channels) : null;
  if (ita == null && greyL == null) {
    return res.status(422).json({ error: 'no skin found in the photo — crop to the face and try again' });
  }
  const prior = SkinToneService.toneDistribution(b.position == null ? null : String(b.position), draftYear);
  const tone = toneFromEvidence({ ita, greyL, prior });
  const rawTone = ita != null ? itaToTone(ita) : null;
  let heads: string[] = [];
  try {
    const feats = await extractFaceFeatures(buf);
    if (feats) heads = LikenessService.rankHeads(feats, tone, gameVersion, 6);
  } catch {
    heads = [];
  }
  res.json({ tone, rawTone, ita, greyL, greyscale: grey, heads });
});

export default r;
