/**
 * Import the equipment-builder thumbnails from a Madden Editor Suite install
 * into server/data/gear so the packaged app ships them (the Suite's full
 * gear-sprites folder is 335 MB / 2,405 files; the builder uses ~560 of them).
 *
 *   npx tsx scripts/import-gear-sprites.ts [suiteDataDir]
 *
 * suiteDataDir defaults to $MADDEN_EDITOR_DATA_DIR, then the repo-relative
 * "Madden Editor Suite/resources/app/.vite/build/data". The output is fully
 * generated: the Suite's gear-atlas.json plus the curated fixes below
 * (removed / relabelled / added entries, and the image substitutions). Edit the
 * tables here, re-run, then run scripts/import-m27-gear-icons.py (the game's own
 * icons and the items the Suite atlas lacks), commit data/gear.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SERVER_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(SERVER_ROOT, 'data', 'gear');
const OUT_SPRITES = path.join(OUT_DIR, 'gear-sprites');
const SUITE_DIR =
  process.argv[2] ||
  process.env.MADDEN_EDITOR_DATA_DIR ||
  path.resolve(SERVER_ROOT, '..', '..', 'Madden Editor Suite', 'resources', 'app', '.vite', 'build', 'data');
const SUITE_SPRITES = path.join(SUITE_DIR, 'gear-sprites');
const M27_ASSETS = path.join(SERVER_ROOT, 'data', 'lookups', 'm27-game-gear-assets.json');

interface Item {
  value: string;
  label: string;
  image: string | null;
  compatibility?: string;
}
type Atlas = Record<string, Item[] | Record<string, string>>;

/** Atlas entries that are not real game assets. */
const REMOVE = new Set<string>([
  // The Suite invented this id and pointed it at the clear-visor sprite. Every
  // real M26 roster player with a Prizm wears GearVisor_visorOakley_Prizm
  // (324 of them in real-player-gear.json); that asset is added below.
  'G_Visor_Oakley_Prizm',
]);

/** Label corrections. Everything else keeps the Suite's label. */
const RELABEL: Record<string, string> = {
  // Name the Zero1 masks by helmet like the Zero2 masks already are.
  GearFaceMask_VicisZero12Bar: 'VICIS Zero1 2 Bar',
  GearFaceMask_VicisZero13Bar: 'VICIS Zero1 3 Bar',
  GearFaceMask_VicisZero13BarLB: 'VICIS Zero1 3 Bar LB',
  GearFaceMask_VicisZero13BarRB: 'VICIS Zero1 3 Bar RB',
  GearFaceMask_VicisZero1BullRB: 'VICIS Zero1 Bull RB',
  GearFaceMask_VicisZero1Fullcage: 'VICIS Zero1 Full Cage',
  GearFaceMask_VicisZero1Robot: 'VICIS Zero1 Robot',
  // Product names: these are the "2" generation of each shoe.
  GearFootwear_shoe_low_NikeVaporEdgePro3602: 'Vapor Edge Pro 360 2 Low',
  GearFootwear_shoe_low_NikeVaporEdgeSpeed3062: 'Vapor Edge Speed 360 2 Low',
  GearFootwear_shoe_mid_NikeDiamondTURF: 'Air Diamond Turf Mid',
  // Madden 27's Legs tab calls the Nike pad "Honeycomb Thigh Pad" (the render is
  // the hex-pattern pad) and the other "Regular".
  ThighPad_Nike: 'Honeycomb',
  ThighPad_Regular: 'Regular',
};

/**
 * Shoulder pads have no render in the Suite; the game shows a jersey with the
 * size letter, so we draw the same. value -> letter.
 */
const DRAWN_PADS: Record<string, string> = { Small_Pads: 'S', Medium_Pads: 'M', Large_Pads: 'L', XLarge_Pads: 'XL' };
function drawnSpriteName(value: string): string {
  return `drawn_${value}.png`;
}
async function drawPads(letter: string, outFile: string): Promise<void> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <path d="M150 70 L212 44 Q256 84 300 44 L362 70 L478 134 L436 226 L372 196 L372 472 L140 472 L140 196 L76 226 L34 134 Z"
        fill="#e6e6e6" stroke="#8a8a8a" stroke-width="8" stroke-linejoin="round"/>
  <text x="256" y="${letter.length > 1 ? 352 : 362}" font-family="Arial, Helvetica, sans-serif" font-weight="bold"
        font-size="${letter.length > 1 ? 150 : 190}" text-anchor="middle" fill="#1a1a1a">${letter}</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outFile);
}

/**
 * Assets the game assigns (m27-game-gear-assets.json, also present in real M26
 * rosters) that the Suite atlas lacks. Each has a same-named nflgear sprite.
 */
const ADD: Record<string, Item[]> = {
  facemasks: [
    { value: 'GearFaceMask_Axiom3BarLBJagged', label: 'Axiom 3 Bar LB Jagged', image: null, compatibility: 'axiom' },
    { value: 'GearFaceMask_F7Pro2Bar', label: 'Schutt F7 Pro 2 Bar', image: null, compatibility: 'f7pro' },
    { value: 'GearFaceMask_F7ProRobot', label: 'Schutt F7 Pro Robot', image: null, compatibility: 'f7pro' },
    { value: 'GearFaceMask_F7ProRobotJagged', label: 'Schutt F7 Pro Robot Jagged', image: null, compatibility: 'f7pro' },
    { value: 'GearFaceMask_F7RobotRB2', label: 'Schutt F7 Robot RB 2', image: null, compatibility: 'f7' },
    { value: 'GearFaceMask_Revospeed_RC', label: 'Revo Speed RC', image: null, compatibility: 'revospeed' },
    { value: 'GearFaceMask_revoSpeedRobot2', label: 'Revo Speed Robot 2', image: null, compatibility: 'revospeed' },
    { value: 'GearFaceMask_revospeed3BarLBStraight', label: 'Revo Speed 3 Bar LB Straight', image: null, compatibility: 'revospeed' },
    { value: 'GearFaceMask_revospeed3barstraight', label: 'Revo Speed 3 Bar Straight', image: null, compatibility: 'revospeed' },
    { value: 'GearFaceMask_SpeedFlex3BarRBSingle', label: 'SpeedFlex 3 Bar RB Single', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_SpeedFlexRobotCage', label: 'SpeedFlex Robot Cage', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_Speedflex3BarJagged', label: 'SpeedFlex 3 Bar Jagged', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_Speedflex3BarRBJagged', label: 'SpeedFlex 3 Bar RB Jagged', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_SpeedflexRBBull', label: 'SpeedFlex RB Bull', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_SpeedflexRobot808', label: 'SpeedFlex Robot 808', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_SpeedflexRobotRBJagged', label: 'SpeedFlex Robot RB Jagged', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_Speedflex_3_Bar_LB_Jewel', label: 'SpeedFlex 3 Bar LB Jewel', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_Speedflex_Robot_Z', label: 'SpeedFlex Robot Z', image: null, compatibility: 'speedflex' },
    { value: 'GearFaceMask_VicisZero23BARLB', label: 'VICIS Zero2 3 Bar LB', image: null, compatibility: 'viciszero2' },
    { value: 'GearFaceMask_VicisZero23BARRB', label: 'VICIS Zero2 3 Bar RB', image: null, compatibility: 'viciszero2' },
    { value: 'GearFaceMask_VicisZero2RobotLB', label: 'VICIS Zero2 Robot LB', image: null, compatibility: 'viciszero2' },
    { value: 'GearFaceMask_VicisZero2RobotRB', label: 'VICIS Zero2 Robot RB', image: null, compatibility: 'viciszero2' },
  ],
  visors: [{ value: 'GearVisor_visorOakley_Prizm', label: 'Oakley Prizm', image: null }],
  shoulderPads: [{ value: 'XLarge_Pads', label: 'X-Large', image: null }],
  shoes: [
    { value: 'GearFootwear_shoe_low_AdidasAdizone11Turbo', label: 'Adizero 11 Turbo Low', image: null },
    { value: 'GearFootwear_shoe_mid_Jordan5', label: 'Jordan 5 Mid', image: null },
  ],
  gloves: [
    { value: 'GearHand_glove_Adizero13MistmatchDSG_SecondaryColor', label: 'Adizero 13 DSG - Secondary', image: null },
    { value: 'GearHand_glove_JordanSuperbad6_SecondaryColor', label: 'Jordan Superbad 6 - Secondary', image: null },
    { value: 'GearHand_glove_JordanVaporJet7_SecondaryColor', label: 'Jordan Vapor Jet 7 - Secondary', image: null },
    { value: 'GearHand_glove_NikeVaporJet4_SecondaryColor', label: 'Vapor Jet 4 - Secondary', image: null },
    { value: 'GearHand_glove_NikeVaporJet_TeamColor', label: 'Vapor Jet - Team', image: null },
    { value: 'GearHand_glove_NikeVaporKnit2_SecondaryColor', label: 'Vapor Knit 2 - Secondary', image: null },
    { value: 'GearHand_glove_NikeVaporKnit_Black', label: 'Vapor Knit - Black', image: null },
    { value: 'GearHand_glove_NikeVaporKnit_SecondaryColor', label: 'Vapor Knit - Secondary', image: null },
    { value: 'GearHand_glove_NikeVaporKnit_White', label: 'Vapor Knit - White', image: null },
  ],
  armSleeves: [
    { value: 'GearArmSleeve_CompressionRolledUpShirt_SecondaryColor', label: 'Rolled Up - Secondary', image: null },
    { value: 'GearArmSleeve_Half_sleeveLongUnderarmor_normal_SecondaryColor', label: 'Half - Secondary', image: null },
    { value: 'GearArmSleeve_NikeHyperstrongPaddedSleeve_Black', label: 'Nike Hyperstrong Padded - Black', image: null },
    { value: 'GearArmSleeve_NikeHyperstrongPaddedSleeve_White', label: 'Nike Hyperstrong Padded - White', image: null },
    { value: 'GearArmSleeve_Quarter_armTape_normal_SecondaryColor', label: 'Quarter Tape - Secondary', image: null },
    { value: 'GearArmSleeve_Undershirt_armTape_normal_SecondaryColor', label: 'Tape - Secondary', image: null },
  ],
  wristGear: [{ value: 'GearWrist_wristTapedMax_SecondaryColor', label: 'Tape Max - Secondary', image: null }],
};

/**
 * Image substitutions. The M27 FaceMarks_* eye-black assets have no render of
 * their own; these are the M26 EyeBlack_* renders of the same look (grease under
 * both eyes, crosses, left/right/both stickers, nose strip). The three with no
 * obvious M26 twin (EyePaint2, EyePaint3, NoseEyeTape) stay blank.
 */
const IMAGE_FROM: Record<string, string> = {
  FaceMarks_EyePaint: 'EyeBlack_Grease',
  FaceMarks_EyePaintCross: 'EyeBlack_Grease_Crosses',
  FaceMarks_EyeTape: 'EyeBlack_Sticker',
  FaceMarks_EyeTapeLeft: 'EyeBlack_L_Sticker',
  FaceMarks_EyeTapeRight: 'EyeBlack_R_Sticker',
  FaceMarks_NoseTape: 'EyeBlack_NoseStrip',
  FaceMarks_NoseTapeEyePaint: 'EyeBlack_Grease_NoseStrip',
};

/** Loadout values the builder offers from code (synthetic slots), not the atlas. */
const SYNTHETIC_VALUES = [
  'Gear_JerseyStyle_SleeveStandard', 'Gear_JerseyStyle_SleeveTight',
  'Gear_Socks_Low', 'Gear_Socks_Mid', 'Gear_Socks_High', 'Gear_Socks_Under',
  'Gear_Socks_Wrinkle_High', 'Gear_Socks_Wrinkle_Mid',
  'Backplate_Standard', 'Flakjacket_On', 'Undershirt_Untucked', 'Handwarmer_Standard',
  'GearNeckpad_CowboyCollarNeckRoll',
];

function nflgearSprite(value: string): string | null {
  const f = `vnty_nflgear_${value}.png`;
  return fs.existsSync(path.join(SUITE_SPRITES, f)) ? f : null;
}

async function main() {
  const atlasPath = path.join(SUITE_DIR, 'gear-atlas.json');
  if (!fs.existsSync(atlasPath) || !fs.existsSync(SUITE_SPRITES)) {
    console.error(`No gear-atlas.json + gear-sprites/ under ${SUITE_DIR}`);
    process.exit(1);
  }
  const src = JSON.parse(fs.readFileSync(atlasPath, 'utf8')) as Atlas;
  const out: Atlas = {};
  const wanted = new Set<string>(); // sprite filenames to copy
  const problems: string[] = [];

  for (const [category, entries] of Object.entries(src)) {
    if (!Array.isArray(entries)) {
      out[category] = entries; // helmetCompatibility
      continue;
    }
    const seen = new Set<string>();
    const list: Item[] = [];
    for (const raw of entries) {
      if (!raw.value || REMOVE.has(raw.value)) continue;
      const item: Item = { value: raw.value, label: RELABEL[raw.value] ?? raw.label ?? raw.value, image: raw.image ?? null };
      if (raw.compatibility) item.compatibility = raw.compatibility;
      if (IMAGE_FROM[item.value]) {
        const twin = entries.find((e) => e.value === IMAGE_FROM[item.value]);
        if (!twin?.image) problems.push(`${item.value}: image twin ${IMAGE_FROM[item.value]} has no sprite`);
        else item.image = twin.image;
      }
      if (!item.image) item.image = nflgearSprite(item.value);
      if (DRAWN_PADS[item.value]) item.image = drawnSpriteName(item.value);
      list.push(item);
      seen.add(item.value);
    }
    for (const add of ADD[category] ?? []) {
      if (seen.has(add.value)) { problems.push(`${add.value}: already in atlas ${category}`); continue; }
      const image = DRAWN_PADS[add.value] ? drawnSpriteName(add.value) : nflgearSprite(add.value);
      if (!image) problems.push(`${add.value}: no nflgear sprite`);
      list.push({ ...add, image });
    }
    for (const unknown of Object.keys(ADD).filter((c) => !(c in src))) problems.push(`ADD category ${unknown} not in atlas`);
    out[category] = list;
    for (const it of list) if (it.image) wanted.add(it.image);
  }

  // Same-named sprites the service finds by fallback (synthetic slots and any
  // game-assigned asset outside the atlas, e.g. socks / jersey style).
  const m27: string[] = fs.existsSync(M27_ASSETS) ? JSON.parse(fs.readFileSync(M27_ASSETS, 'utf8')) : [];
  for (const v of [...SYNTHETIC_VALUES, ...m27]) {
    const f = nflgearSprite(v);
    if (f) wanted.add(f);
  }

  const drawn = new Set(Object.keys(DRAWN_PADS).map(drawnSpriteName));
  for (const f of wanted) {
    if (!drawn.has(f) && !fs.existsSync(path.join(SUITE_SPRITES, f))) problems.push(`sprite missing in Suite: ${f}`);
  }
  if (problems.length) {
    console.error('Import aborted:\n  ' + problems.join('\n  '));
    process.exit(1);
  }

  fs.mkdirSync(OUT_SPRITES, { recursive: true });
  let copied = 0;
  for (const f of wanted) {
    if (drawn.has(f)) continue;
    fs.copyFileSync(path.join(SUITE_SPRITES, f), path.join(OUT_SPRITES, f));
    copied++;
  }
  for (const [value, letter] of Object.entries(DRAWN_PADS)) await drawPads(letter, path.join(OUT_SPRITES, drawnSpriteName(value)));
  let removed = 0;
  for (const f of fs.readdirSync(OUT_SPRITES)) {
    if (!wanted.has(f)) { fs.unlinkSync(path.join(OUT_SPRITES, f)); removed++; }
  }
  const meta = {
    _meta: {
      source: 'Madden Editor Suite gear-atlas.json + gear-sprites, curated by scripts/import-gear-sprites.ts',
      importedAt: new Date().toISOString().slice(0, 10),
      sprites: wanted.size,
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'gear-atlas.json'), JSON.stringify({ ...meta, ...out }, null, 1) + '\n');

  const bytes = [...wanted].reduce((n, f) => n + fs.statSync(path.join(OUT_SPRITES, f)).size, 0);
  const items = Object.values(out).filter(Array.isArray).reduce((n, l) => n + l.length, 0);
  const withImage = Object.values(out).filter(Array.isArray).reduce((n, l) => n + l.filter((i) => i.image).length, 0);
  console.log(`atlas: ${items} items, ${withImage} with a picture`);
  console.log(`sprites: ${copied} copied + ${drawn.size} drawn (${(bytes / 1048576).toFixed(1)} MB), ${removed} stale removed -> ${OUT_SPRITES}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
