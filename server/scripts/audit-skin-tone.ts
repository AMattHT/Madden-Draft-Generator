/**
 * Era-by-era review queue for players whose appearance is guessed.
 *
 * Two thirds of the database has no photograph the app can reach, so the tone
 * comes from a position/era prior. That is a coin weighted by the decade, and
 * it is wrong for individuals in both directions -- Bob Hayes came out white,
 * Paul Krause black. The curated overlay fixes the Hall of Famers; this finds
 * who is worth looking at next.
 *
 * It cannot tell you who is WRONG -- if the app could know that, it would not
 * be guessing. What it can do is rank by how much a mistake would cost:
 *
 *   exposure = how prominent the player is (career value)
 *   doubt    = how little the prior committed to the tone it chose
 *
 * A 50/50 prior on a player nobody looks at matters less than a 60/40 prior on
 * a first-round starter. Sorting by exposure x doubt puts the faces most likely
 * to be noticed, and least confidently assigned, at the top.
 *
 * Grouped by era rather than by draft year because the prior IS a position/era
 * distribution: a year is a slice of one guess, an era is the guess itself. It
 * also makes the one era that needs no guessing obvious -- the NFL was
 * segregated from 1934 to 1945, so those players are light by rule.
 *
 *   npx tsx scripts/audit-skin-tone.ts [--era 1960] [--top 25] [--csv out.csv]
 */
import fs from 'fs';
import { PlayerLookupService } from '../src/services/PlayerLookupService';
import { DerivedSkinToneService } from '../src/services/DerivedSkinToneService';
import { RetroItaService } from '../src/services/RetroItaService';
import { CuratedSkinToneService } from '../src/services/CuratedSkinToneService';
import { SkinToneService } from '../src/services/SkinToneService';
import { toneFromEvidence } from '../src/services/SkinToneClassify';
import type { BaselinePlayer } from '../src/types/player';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] ?? null : null;
};

/** True when nothing but the prior decided this player's tone. */
function priorOnly(p: BaselinePlayer): boolean {
  const portrait = p.photoId ? DerivedSkinToneService.itaForPid(p.photoId) : null;
  if (portrait && (portrait.ita != null || portrait.greyL != null)) return false;
  if (RetroItaService.itaFor(p.firstName, p.lastName, p.position) != null) return false;
  if (p.wikiImageUrl) return false;
  if (p.race != null && p.race !== 7) return false;
  return true;
}

interface Row {
  year: number;
  name: string;
  position: string;
  wav: number;
  tone: number;
  confidence: number;
  score: number;
  hof: boolean;
}

function review(year: number): { rows: Row[]; total: number; guessed: number; curated: number } {
  const players = PlayerLookupService.byYear(year);
  const rows: Row[] = [];
  let guessed = 0;
  let curated = 0;
  for (const p of players) {
    if (CuratedSkinToneService.toneFor(p.firstName, p.lastName, p.draftYear) != null) { curated++; continue; }
    if (!priorOnly(p)) continue;
    guessed++;
    const prior = SkinToneService.toneDistribution(p.position, p.draftYear);
    const tone = toneFromEvidence({ prior });
    // How much the prior committed: the share it put on the tone it picked,
    // against the light/dark split rather than the exact shade -- the shade is
    // cosmetic, the side of the line is what reads as wrong.
    const lightMass = [1, 2, 3].reduce((s, t) => s + (prior[t] ?? 0), 0);
    const darkMass = [5, 6, 7].reduce((s, t) => s + (prior[t] ?? 0), 0);
    const total = lightMass + darkMass || 1;
    const confidence = Math.max(lightMass, darkMass) / total;
    const wav = p.wav ?? 0;
    // Doubt is 0 at a decided prior and 1 at a coin flip.
    const doubt = Math.max(0, 1 - (confidence - 0.5) * 2);
    rows.push({
      year, name: `${p.firstName} ${p.lastName}`, position: p.position,
      wav, tone, confidence, hof: !!p.isHOF, score: wav * doubt,
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return { rows, total: players.length, guessed, curated };
}

/** Eras of NFL racial demography, which is what the prior is really modelling. */
const ERAS: Array<{ from: number; to: number; label: string }> = [
  { from: 1936, to: 1945, label: 'segregated (no black players)' },
  { from: 1946, to: 1961, label: 'reintegration' },
  { from: 1962, to: 1969, label: 'AFL era' },
  { from: 1970, to: 1989, label: 'post-merger' },
  { from: 1990, to: 2009, label: 'modern' },
  { from: 2010, to: 2026, label: 'current' },
];

function main() {
  const oneEra = arg('era');
  const top = Number(arg('top') ?? 15);
  const csv = arg('csv');
  const years = PlayerLookupService.years();

  const all: Row[] = [];
  console.log(`${'era'.padEnd(12)} ${'players'.padStart(8)} ${'guessed'.padStart(8)} ${'recorded'.padStart(9)}  ${'%guessed'.padStart(8)}  what it is`);
  for (const era of ERAS) {
    if (oneEra && Number(oneEra) !== era.from) continue;
    let total = 0, guessed = 0, curated = 0;
    const rows: Row[] = [];
    for (const y of years) {
      if (y < era.from || y > era.to) continue;
      const r = review(y);
      total += r.total; guessed += r.guessed; curated += r.curated;
      rows.push(...r.rows);
    }
    if (!total) continue;
    rows.sort((a, b) => b.score - a.score);
    all.push(...rows);
    const pct = ((100 * guessed) / total).toFixed(0);
    console.log(`${(era.from + '-' + era.to).padEnd(12)} ${String(total).padStart(8)} ${String(guessed).padStart(8)} ${String(curated).padStart(9)}  ${(pct + '%').padStart(8)}  ${era.label}`);
    if (oneEra) {
      for (const r of rows.slice(0, top)) {
        console.log(`   ${String(r.year).padEnd(6)} ${r.name.padEnd(24)} ${r.position.padEnd(5)} wAV ${String(r.wav).padStart(4)}  tone ${r.tone}  prior ${(100 * r.confidence).toFixed(0)}%`);
      }
    }
  }

  if (csv) {
    all.sort((a, b) => b.score - a.score);
    const lines = ['year,name,position,wav,inferred_tone,prior_confidence,is_hof'];
    for (const r of all) lines.push([r.year, `"${r.name}"`, r.position, r.wav, r.tone, r.confidence.toFixed(3), r.hof].join(','));
    fs.writeFileSync(csv, lines.join('\n'));
    console.log(`\nwrote ${all.length} rows -> ${csv}`);
  }

  if (!oneEra) {
    all.sort((a, b) => b.score - a.score);
    console.log(`\nHighest exposure x doubt, any era -- review these first:`);
    for (const r of all.slice(0, top)) {
      console.log(`  ${String(r.year).padEnd(6)} ${r.name.padEnd(24)} ${r.position.padEnd(5)} wAV ${String(r.wav).padStart(4)}  tone ${r.tone}  prior ${(100 * r.confidence).toFixed(0)}%`);
    }
  }
}

main();
