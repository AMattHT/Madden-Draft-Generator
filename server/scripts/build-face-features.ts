/**
 * Bake appearance features for generic heads and for real players.
 *
 * The generic head a player gets is chosen by SKIN TONE ALONE, so a light-haired
 * clean-shaven kicker can draw a head with dark hair and stubble (Pat Leahy did).
 * The face catalog carries no hair or facial-hair metadata -- only tone and a
 * headwear flag -- so nothing at runtime could do better.
 *
 * This measures the heads and the players from their own pictures instead:
 *
 *   generic-head-features.json  gen_* code   -> features, per game
 *   player-face-features.json   player name  -> features, from the retro pack
 *
 * Both come out of the same extractor, and every feature is a ratio against the
 * subject's own cheek, so a photograph and a game render stay comparable.
 * Players are measured from the Madden disc headshots (2001-2017): studio crops
 * on a flat background, framed like the head portraits, which is exactly what
 * this needs. A web photo could be an action shot and is not used.
 *
 *   npx tsx scripts/build-face-features.ts
 */
import fs from 'fs';
import path from 'path';
import { DATA_ROOT, LOOKUPS_DIR } from '../src/config/paths';
import { LikenessService } from '../src/services/LikenessService';
import { PortraitService } from '../src/services/PortraitService';
import { extractFaceFeatures, FaceFeatures } from '../src/services/FaceFeatures';

const GAMES: ('m26' | 'm27')[] = ['m26', 'm27'];

async function buildHeads() {
  // The file maps gen_* code -> portrait PID per game.
  const pools = JSON.parse(
    fs.readFileSync(path.join(LOOKUPS_DIR, 'generic-heads-by-game.json'), 'utf8')
  ) as Record<string, Record<string, number>>;
  const out: Record<string, Record<string, FaceFeatures>> = {};
  for (const game of GAMES) {
    const codes = Object.keys(pools[game] || {});
    const entry: Record<string, FaceFeatures> = {};
    let miss = 0;
    for (const code of codes) {
      const pid = pools[game][code] ?? LikenessService.genericPid(code, game);
      const plpo = pid != null ? PortraitService.plpoForPid(pid) : null;
      const buf = plpo ? await PortraitService.cropByPlpo(plpo) : null;
      const f = buf ? await extractFaceFeatures(buf) : null;
      if (f) entry[code] = f;
      else miss++;
    }
    out[game] = entry;
    console.log(`  ${game}: ${Object.keys(entry).length} heads measured${miss ? `, ${miss} unrenderable` : ''}`);
  }
  fs.writeFileSync(path.join(LOOKUPS_DIR, 'generic-head-features.json'), JSON.stringify(out));
}

async function buildPlayers() {
  const dir = path.join(DATA_ROOT, 'retro-portraits');
  if (!fs.existsSync(dir)) {
    console.warn('  retro-portraits missing — run build-retro-headshot-pack.ts first');
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
  const out: Record<string, FaceFeatures> = {};
  let miss = 0;
  for (const file of files) {
    const f = await extractFaceFeatures(fs.readFileSync(path.join(dir, file)));
    // The pack is keyed "<first>_<last>" already normalized; keep that key.
    if (f) out[file.replace(/\.png$/, '')] = f;
    else miss++;
  }
  fs.writeFileSync(path.join(LOOKUPS_DIR, 'player-face-features.json'), JSON.stringify(out));
  console.log(`  players: ${Object.keys(out).length} measured from the retro pack${miss ? `, ${miss} unreadable` : ''}`);
}

(async () => {
  await buildHeads();
  await buildPlayers();
  for (const f of ['generic-head-features.json', 'player-face-features.json']) {
    const p = path.join(LOOKUPS_DIR, f);
    if (fs.existsSync(p)) console.log(`  -> ${f} (${Math.round(fs.statSync(p).size / 1024)} KB)`);
  }
})();
