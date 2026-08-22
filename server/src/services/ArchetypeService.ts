import { CalibrationService } from './CalibrationService';
import { CareerBits } from './NflverseCareerService';
import { CombineMeasurements } from '../types/player';

/**
 * Pick a Madden archetype from real-player signal, not just body type.
 *
 * Order:
 *   1. Career usage (YPR, rush share, sacks, pass yards) when the sample is large
 *   2. Combine (40-yard) as a tie-break
 *   3. Fall back to nearest height/weight profile (Madden's own mix)
 *
 * Only fires when the usage sample is big enough — fillers and 3-game careers
 * stay on the build-based pick.
 */
export const ArchetypeService = {
  assign(
    posName: string,
    heightInches: number,
    weight: number,
    career: CareerBits | null,
    combine?: CombineMeasurements | null
  ): number {
    const byBuild = CalibrationService.bestArchetypeForBuild(posName, heightInches, weight);
    const fromUsage = usageArchetype(posName, heightInches, weight, career, combine);
    return fromUsage ?? byBuild;
  },
};

function usageArchetype(
  pos: string,
  ht: number,
  wt: number,
  c: CareerBits | null,
  combine?: CombineMeasurements | null
): number | null {
  if (!c) return null;
  const rec = c.receptions ?? 0;
  const recYds = c.recYards ?? 0;
  const recTd = c.recTds ?? 0;
  const rushAtt = c.rushAtts ?? 0;
  const rushYds = c.rushYards ?? 0;
  const sacks = c.defSacks ?? 0;
  const passYds = c.passYards ?? 0;
  const ypr = rec >= 40 ? recYds / rec : null;
  const forty = combine?.forty ?? null;

  if (pos === 'WR') {
    if (rec < 40) return null;
    // Slot: short, high-volume, modest YPR.
    if (ht <= 71 && (ypr == null || ypr < 13)) return 21;
    // Deep threat: long average or a real burner.
    if ((ypr != null && ypr >= 15.5) || (forty != null && forty <= 4.38 && ht <= 74)) return 14;
    // Physical: big red-zone / contested WR (Carter, Harrison, Julio-type).
    if (ht >= 74 && (wt >= 200 || recTd >= 60)) return 20;
    // High-volume all-around stays Playmaker.
    if (rec >= 400 || recYds >= 5000) return 15;
    return null;
  }

  if (pos === 'HB' || pos === 'FB') {
    if (rushAtt + rec < 80) return null;
    const recShare = rec / Math.max(1, rushAtt + rec);
    if (recShare >= 0.28 && rec >= 80) return 7; // Receiving Back
    if (wt >= 225 && rushYds >= 2000) return 5; // Power
    if (wt <= 210 && recShare < 0.22) return 6; // Elusive
    return null;
  }

  if (pos === 'QB') {
    if (passYds < 1500 && rushYds < 400) return null;
    if (rushYds >= 1500 || (rushAtt >= 250 && rushYds >= 800)) return 3; // Scrambler
    if (ht >= 75 && wt >= 230) return 1; // Strong Arm
    return 0; // Field General
  }

  if (pos === 'TE') {
    if (rec < 30 && rushAtt < 10) {
      if (wt >= 260) return 22; // Blocking
      return null;
    }
    if (ypr != null && ypr >= 13.5) return 23; // Vertical Threat
    return 26; // Possession
  }

  if (pos === 'LEDG' || pos === 'REDG') {
    if (sacks < 8 && (c.seasonsStarted ?? 0) < 3) return null;
    if (wt <= 255 && (sacks >= 40 || (forty != null && forty <= 4.7))) return 39; // Smaller Speed
    if (wt >= 275 && sacks < 40) return 42; // Run Stopper
    if (sacks >= 40) return 40; // Power Rusher
    return null;
  }

  if (pos === 'DT') {
    if ((c.seasonsStarted ?? 0) < 2 && sacks < 8) return null;
    if (wt >= 325) return 43; // Nose
    if (sacks >= 30 || wt <= 295) return 45; // Speed Rusher
    return 46; // Power Rusher
  }

  return null;
}
