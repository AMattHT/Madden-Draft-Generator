/**
 * M27 Draft Class Parser
 *
 * Madden 27 record layout (reverse-engineered from CAREERDRAFT-TEST* files, Aug 2026):
 * - 5876-byte blocks (0x16F4) per prospect, 455 physical blocks per file
 * - First 5632 bytes (0x1600): visual JSON — stored UNCOMPRESSED (M26 used zstd)
 * - Last 244 bytes (0xF4): attribute binary section
 *
 * Attribute section offsets (relative to blockStart + 0x1600). Most fields that
 * existed in M26 shifted +4 after the widened name fields (21 bytes each, M26
 * used 17/15); the tail is restructured: devTrait 0x90, commentaryId 0x94,
 * PID 0x9e, real-face assetName 0xa0 (42 bytes), persona DNA 5xU16 at 0xca.
 */

const BLOCK_SIZE = 5876; // 0x16F4
const VISUAL_SIZE = 0x1600; // 5632
const ATTRIBUTE_OFFSET = 0x1600;
const ATTRIBUTE_DATA_SIZE = 0xf4; // 244

/** M27 attribute-section field offsets (relative to section start). */
const M27_FIELDS = {
  firstName: { off: 0x00, len: 0x15 },
  lastName: { off: 0x15, len: 0x15 },
  homeState: { off: 0x2a },
  homeTown: { off: 0x2b, len: 0x1b },
  college: { off: 0x46, u16: true },
  age: { off: 0x4a },
  heightInches: { off: 0x4b },
  weight: { off: 0x4c }, // stored as weight-160
  position: { off: 0x4e },
  archetype: { off: 0x4f },
  jerseyNum: { off: 0x50 },
  draftPick: { off: 0x52 },
  draftRound: { off: 0x54 },
  overall: { off: 0x55 },
  devTrait: { off: 0x90 }, // 0=Normal, 1=Star, 2=Superstar, 3=X-Factor (same as M26)
  commentaryId: { off: 0x94, u16: true }, // tentative
  PID: { off: 0x9e, u16: true },
  assetName: { off: 0xa0, len: 42 }, // real face asset (e.g. "WilliamsCaleb_14500")
  personaDNA: { off: 0xca, u16x5: true }, // 5 Persona DNA trait slots
};

/** Rating byte offsets — M26 offsets +4 (post-name-fields shift), same order. */
const M27_RATINGS = {
  acceleration: 0x56, agility: 0x57, awareness: 0x58, ballCarrierVision: 0x59,
  blockShedding: 0x5a, breakSack: 0x5b, breakTackle: 0x5c, carrying: 0x5d,
  catching: 0x5e, catchInTraffic: 0x5f, changeOfDirection: 0x60, finesseMoves: 0x61,
  hitPower: 0x62, kickAccuracy: 0x67, kickPower: 0x68, kickReturn: 0x69,
  impactBlocking: 0x63, injury: 0x64, jukeMove: 0x65, jumping: 0x66,
  leadBlock: 0x6a, manCoverage: 0x6c, playAction: 0x71, playRecognition: 0x72,
  passBlockPower: 0x6d, passBlockFinesse: 0x6e, passBlock: 0x6f, powerMoves: 0x73,
  pressCoverage: 0x74, pursuit: 0x75, release: 0x76, deepRouteRunning: 0x77,
  mediumRouteRunning: 0x78, shortRouteRunning: 0x79, runBlockFinesse: 0x7a,
  runBlockPower: 0x7b, runBlock: 0x7c, stamina: 0x81, stiffArm: 0x82,
  spectacularCatch: 0x7e, speed: 0x7f, spinMove: 0x80, strength: 0x83,
  tackle: 0x84, throwAccuracyDeep: 0x85, throwAccuracyMid: 0x86,
  throwUnderPressure: 0x8b, throwAccuracyShort: 0x88, throwOnTheRun: 0x89,
  throwPower: 0x8a, toughness: 0x8c, zoneCoverage: 0x8e, longSnap: 0x8f,
  trucking: 0x8d,
};

function readAscii(buf, off, len) {
  return buf.toString('ascii', off, off + len).replace(/\0/g, '').trim();
}

/** Parse one 244-byte attribute section. */
function parseM27AttributeData(attr) {
  const a = {};
  a.firstName = readAscii(attr, M27_FIELDS.firstName.off, M27_FIELDS.firstName.len);
  a.lastName = readAscii(attr, M27_FIELDS.lastName.off, M27_FIELDS.lastName.len);
  a.homeState = attr[M27_FIELDS.homeState.off] || 0;
  a.homeTown = readAscii(attr, M27_FIELDS.homeTown.off, M27_FIELDS.homeTown.len);
  a.college = attr.readUInt16LE(M27_FIELDS.college.off) || 0;
  a.age = attr[M27_FIELDS.age.off] || 0;
  a.heightInches = attr[M27_FIELDS.heightInches.off] || 0;
  a.weight = (attr[M27_FIELDS.weight.off] || 0) + 160;
  a.position = attr[M27_FIELDS.position.off] || 0;
  a.archetype = attr[M27_FIELDS.archetype.off] || 0;
  a.jerseyNum = attr[M27_FIELDS.jerseyNum.off] || 0;
  a.draftPick = attr[M27_FIELDS.draftPick.off] || 0;
  a.draftRound = attr[M27_FIELDS.draftRound.off] || 0;
  a.overall = attr[M27_FIELDS.overall.off] || 0;
  a.devTrait = attr[M27_FIELDS.devTrait.off] || 0;
  a.commentaryId = attr.readUInt16LE(M27_FIELDS.commentaryId.off) || 0;
  a.PID = attr.readUInt16LE(M27_FIELDS.PID.off) || 0;
  a.assetName = readAscii(attr, M27_FIELDS.assetName.off, M27_FIELDS.assetName.len) || null;

  const dna = [];
  for (let i = 0; i < 5; i++) {
    const v = attr.readUInt16LE(M27_FIELDS.personaDNA.off + i * 2);
    if (v) dna.push(v);
  }
  a.personaDNA = dna; // Persona DNA trait ids (indexes into the 65-value DNA enum)

  for (const [key, off] of Object.entries(M27_RATINGS)) a[key] = attr[off] || 0;

  // Face asset the game should use: real asset from binary, else null (visuals carry gen_)
  a.PEPS = a.assetName || null;
  return a;
}

/**
 * Parse an M27 draft class buffer.
 * @param {Buffer} buffer
 * @param {{ dataStartOffset: number }} header
 * @returns {Array} prospects (including zeroed unused blocks as empty shells)
 */
function parseM27Prospects(buffer, header) {
  const prospects = [];
  const dataStart = header.dataStartOffset;
  const capacity = Math.floor((buffer.length - dataStart) / BLOCK_SIZE);

  for (let i = 0; i < capacity; i++) {
    const blockStart = dataStart + i * BLOCK_SIZE;
    const attrOff = blockStart + ATTRIBUTE_OFFSET;
    const attr = buffer.subarray(attrOff, attrOff + ATTRIBUTE_DATA_SIZE);

    // Unused blocks are fully zeroed in M27 files.
    let used = false;
    for (let j = 0; j < ATTRIBUTE_DATA_SIZE; j++) {
      if (attr[j] !== 0) { used = true; break; }
    }

    let visuals = null;
    if (buffer[blockStart] === 0x7b) {
      // '{' — uncompressed JSON at the start of the visual region
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let j = blockStart; j < blockStart + VISUAL_SIZE; j++) {
        const c = buffer[j];
        if (esc) { esc = false; continue; }
        if (c === 0x5c && inStr) { esc = true; continue; }
        if (c === 0x22) { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === 0x7b) depth++;
        else if (c === 0x7d) { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end !== -1) {
        try { visuals = JSON.parse(buffer.toString('utf8', blockStart, end + 1)); } catch { visuals = null; }
      }
    }

    const attributes = used ? parseM27AttributeData(attr) : { firstName: '', lastName: '', overall: 0, position: 0 };
    prospects.push({ ...attributes, visuals, draftPosition: i, index: i });
  }
  return prospects;
}

module.exports = {
  parseM27Prospects,
  parseM27AttributeData,
  M27_BLOCK_SIZE: BLOCK_SIZE,
  M27_VISUAL_SIZE: VISUAL_SIZE,
  M27_ATTRIBUTE_OFFSET: ATTRIBUTE_OFFSET,
  M27_ATTRIBUTE_SIZE: ATTRIBUTE_DATA_SIZE,
  M27_FIELDS,
  M27_RATINGS,
};
