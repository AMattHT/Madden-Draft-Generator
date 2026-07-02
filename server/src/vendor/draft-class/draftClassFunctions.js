/**
 * draftClassFunctions - Player data parsing and serialization logic
 * Source: Adapted from madden-draft-class-tools by WiiExpertise (GPL-3.0)
 *
 * Handles parsing of draft class file structure and player records
 */

const FileParser = require('./FileParser');
const { decompress, detectCompression } = require('./Decompressor');

// Format Constants - Calibrated from madden-draft-class-tools
// Reference: node_modules/madden-draft-class-tools/utils/draftClassFunctions.js lines 5-7
const MAX_ENTRY_SIZE = 0x10E2;    // 4322 bytes per player entry (M25/M26)
const MAX_VISUALS_SIZE = 0x1000;  // 4096 bytes per CharacterVisuals string
const MAX_PLAYER_DATA_SIZE = 0xE2; // 226 bytes per entry player data (not 1226!)

// String Field Length Constants
const FIRST_NAME = 0x11;   // 17 bytes
const LAST_NAME = 0x15;    // 21 bytes
const HOME_TOWN = 0x1B;    // 27 bytes
const ASSET_NAME = 0x2A;   // 42 bytes

/**
 * Parse FBCHUNKS header from draft class file
 * @param {FileParser} parser - FileParser instance
 * @returns {Object} Header information
 */
function parseHeader(parser) {
  // Verify FBCHUNKS signature
  const signature = parser.readSizedString(8);
  if (signature !== 'FBCHUNKS') {
    throw new Error(`Invalid file signature: ${signature} (expected "FBCHUNKS")`);
  }

  // Read version byte
  const version = parser.readByte();

  // Skip unknown header data (varies by file)
  parser.offset = 0x16;

  // Read year (2 bytes, little-endian)
  const year = parser.readUShort();

  // Skip to product string
  parser.offset = 0x22;

  // Read product string (up to 30 bytes, null-terminated)
  const product = parser.readSizedString(30);

  // Determine game version from product string
  const gameVersion = product.includes('Madden-26') ? 'M26' :
                      product.includes('Madden-25') ? 'M25' : 'unknown';

  // Data start offset differs by version:
  // M25: 0x4C (76 bytes) - standard header
  // M26: 0x46 (70 bytes) - header is 6 bytes shorter
  const dataStartOffset = gameVersion === 'M26' ? 0x46 : 0x4C;
  parser.offset = dataStartOffset;

  // Calculate number of prospects from file size
  // This is approximate - we'll parse until we can't read more
  const fileSize = parser.buffer.length;
  const estimatedProspects = Math.floor((fileSize - parser.offset) / MAX_ENTRY_SIZE);

  return {
    signature,
    version,
    year,
    product,
    gameVersion,
    dataStartOffset: parser.offset,
    estimatedProspects
  };
}

/**
 * Parse all prospects from draft class file
 * @param {FileParser} parser - FileParser instance
 * @param {Object} header - Parsed header information
 * @returns {Array} Array of prospect objects
 */
function parseProspects(parser, header) {
  const prospects = [];
  let prospectIndex = 0;

  // Parse prospects until we run out of data
  while (parser.canRead(MAX_ENTRY_SIZE)) {
    try {
      const prospect = parseProspect(parser, prospectIndex);
      if (prospect) {
        prospects.push(prospect);
        prospectIndex++;
      } else {
        break; // No more valid prospects
      }
    } catch (error) {
      console.warn(`Failed to parse prospect ${prospectIndex}:`, error.message);
      break; // Stop parsing on error
    }
  }

  return prospects;
}

/**
 * Parse single prospect record (4322 bytes)
 * @param {FileParser} parser - FileParser instance
 * @param {number} index - Prospect index
 * @returns {Object} Prospect data
 */
function parseProspect(parser, index) {
  const prospectStartOffset = parser.offset;

  // Read the entire 4322-byte prospect record
  const prospectData = parser.readBytes(MAX_ENTRY_SIZE);

  // First 4096 bytes: Visual JSON data (may be compressed)
  const visualData = prospectData.subarray(0, MAX_VISUALS_SIZE);

  // Remaining 1226 bytes: Binary attribute data
  const attributeData = prospectData.subarray(MAX_VISUALS_SIZE);

  // Parse visual data
  const visuals = parseVisualData(visualData);

  // Parse attribute data
  const attributes = parseAttributeData(attributeData);

  return {
    index,
    draftPosition: index, // Track position in file for reordering (0-indexed)
    offset: prospectStartOffset,
    visuals,
    ...attributes
  };
}

/**
 * Parse visual/appearance JSON data
 * @param {Buffer} visualData - 4096-byte visual data buffer
 * @returns {Object} Parsed visual JSON or null
 */
function parseVisualData(visualData) {
  try {
    // Detect if data is compressed
    const compressionType = detectCompression(visualData);

    let jsonData;
    if (compressionType !== 'none') {
      // Decompress if needed
      const decompressed = decompress(visualData, compressionType);
      jsonData = decompressed.toString('utf8');
    } else {
      jsonData = visualData.toString('utf8');
    }

    // Find JSON boundaries
    const jsonStart = jsonData.indexOf('{');
    const jsonEnd = jsonData.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const jsonString = jsonData.substring(jsonStart, jsonEnd + 1);
      return JSON.parse(jsonString);
    }

    return null;
  } catch (error) {
    console.warn('Failed to parse visual data:', error.message);
    return null;
  }
}

/**
 * Parse binary attribute data (226 bytes after visual data)
 * Calibrated from madden-draft-class-tools reference implementation
 * @param {Buffer} attributeData - 226-byte attribute buffer (MAX_PLAYER_DATA_SIZE = 0xE2)
 * @returns {Object} Player attributes
 */
function parseAttributeData(attributeData) {
  const parser = new FileParser(attributeData);

  // NOTE: These offsets are SEQUENTIAL based on madden-draft-class-tools
  // Reference: node_modules/madden-draft-class-tools/utils/draftClassFunctions.js lines 79-211
  // Each readByte() or readUShort() auto-advances the offset

  const attributes = {};

  try {
    // String constants from reference:
    // FIRST_NAME = 0x11 (17 bytes)
    // LAST_NAME = 0x15 (21 bytes)
    // HOME_TOWN = 0x1B (27 bytes)
    // ASSET_NAME = 0x2A (42 bytes)

    // Personal Information (strings) - lines 82-85
    attributes.firstName = parser.readSizedString(0x11); // 17 bytes
    attributes.lastName = parser.readSizedString(0x15); // 21 bytes
    attributes.homeState = parser.readByte(); // 1 byte
    attributes.homeTown = parser.readSizedString(0x1B); // 27 bytes

    // College and demographics - lines 86-91
    attributes.college = parser.readUShort(); // 2 bytes
    attributes.birthDate = parser.readUShort(); // 2 bytes
    attributes.age = parser.readByte(); // 1 byte
    attributes.heightInches = parser.readByte(); // 1 byte
    attributes.weight = 160 + parser.readUShort(); // 2 bytes (offset by 160)

    // Position and draft info - lines 93-99
    attributes.position = parser.readByte(); // 1 byte
    attributes.archetype = parser.readByte(); // 1 byte
    attributes.jerseyNum = parser.readByte(); // 1 byte
    attributes.draftable = parser.readByte(); // 1 byte
    attributes.draftPick = parser.readUShort(); // 2 bytes
    attributes.draftRound = parser.readByte(); // 1 byte

    // Ratings and attributes - lines 102-158 (all sequential readByte())
    attributes.overall = parser.readByte();
    attributes.acceleration = parser.readByte();
    attributes.agility = parser.readByte();
    attributes.awareness = parser.readByte();
    attributes.ballCarrierVision = parser.readByte();
    attributes.blockShedding = parser.readByte();
    attributes.breakSack = parser.readByte();
    attributes.breakTackle = parser.readByte();
    attributes.carrying = parser.readByte();
    attributes.catching = parser.readByte();
    attributes.catchInTraffic = parser.readByte();
    attributes.changeOfDirection = parser.readByte();
    attributes.finesseMoves = parser.readByte();
    attributes.hitPower = parser.readByte();
    attributes.impactBlocking = parser.readByte();
    attributes.injury = parser.readByte();
    attributes.jukeMove = parser.readByte();
    attributes.jumping = parser.readByte();
    attributes.kickAccuracy = parser.readByte();
    attributes.kickPower = parser.readByte();
    attributes.kickReturn = parser.readByte();
    attributes.leadBlock = parser.readByte();
    attributes.manCoverage = parser.readByte();
    attributes.passBlockFinesse = parser.readByte();
    attributes.passBlockPower = parser.readByte();
    attributes.passBlock = parser.readByte();
    attributes.personality = parser.readByte();
    attributes.playAction = parser.readByte();
    attributes.playRecognition = parser.readByte();
    attributes.powerMoves = parser.readByte();
    attributes.pressCoverage = parser.readByte();
    attributes.pursuit = parser.readByte();
    attributes.release = parser.readByte();
    attributes.shortRouteRunning = parser.readByte();
    attributes.mediumRouteRunning = parser.readByte();
    attributes.deepRouteRunning = parser.readByte();
    attributes.runBlockFinesse = parser.readByte();
    attributes.runBlockPower = parser.readByte();
    attributes.runBlock = parser.readByte();
    attributes.runningStyle = parser.readByte();
    attributes.spectacularCatch = parser.readByte();
    attributes.speed = parser.readByte();
    attributes.spinMove = parser.readByte();
    attributes.stamina = parser.readByte();
    attributes.stiffArm = parser.readByte();
    attributes.strength = parser.readByte();
    attributes.tackle = parser.readByte();
    attributes.throwAccuracyDeep = parser.readByte();
    attributes.throwAccuracyMid = parser.readByte();
    attributes.throwAccuracy = parser.readByte();
    attributes.throwAccuracyShort = parser.readByte();
    attributes.throwOnTheRun = parser.readByte();
    attributes.throwPower = parser.readByte();
    attributes.throwUnderPressure = parser.readByte();
    attributes.toughness = parser.readByte();
    attributes.trucking = parser.readByte();
    attributes.zoneCoverage = parser.readByte();
    attributes.morale = parser.readByte();

    // Traits - lines 160-185 (all sequential readByte())
    attributes.traitBigHitter = parser.readByte();
    attributes.traitPossessionCatch = parser.readByte();
    attributes.traitClutch = parser.readByte();
    attributes.traitCoverBall = parser.readByte();
    attributes.traitDeepBall = parser.readByte();
    attributes.traitDlBullRush = parser.readByte();
    attributes.traitDlSpinMove = parser.readByte();
    attributes.traitDlSwimMove = parser.readByte();
    attributes.traitDropsOpen = parser.readByte();
    attributes.traitSidelineCatch = parser.readByte();
    attributes.traitFightForYards = parser.readByte();
    attributes.traitUnk1 = parser.readByte();
    attributes.traitHighMotor = parser.readByte();
    attributes.traitAggressiveCatch = parser.readByte();
    attributes.traitPenalty = parser.readByte();
    attributes.traitPlayBall = parser.readByte();
    attributes.traitPumpFake = parser.readByte();
    attributes.traitLbStyle = parser.readByte();
    attributes.traitSensePressure = parser.readByte();
    attributes.traitUnk2 = parser.readByte();
    attributes.traitStripBall = parser.readByte();
    attributes.traitTackleLow = parser.readByte();
    attributes.traitThrowAway = parser.readByte();
    attributes.traitTightSpiral = parser.readByte();
    attributes.traitTendency = parser.readByte();
    attributes.traitRunAfterCatch = parser.readByte();

    // Dev trait and other attributes - lines 187-209
    attributes.devTrait = parser.readByte();
    attributes.traitPredictability = parser.readByte();
    attributes.unkByte2 = parser.readByte();
    attributes.genericHead = parser.readUShort(); // 2 bytes
    attributes.handedness = parser.readUShort(); // 2 bytes
    attributes.portraitId = parser.readUShort(); // 2 bytes
    attributes.qbStyle = parser.readByte();
    attributes.qbStance = parser.readByte();
    attributes.unk3 = parser.readByte();
    attributes.unk4 = parser.readByte();
    attributes.unk5 = parser.readByte();
    attributes.unk6 = parser.readByte();
    attributes.visMoveType = parser.readByte();
    attributes.unk8 = parser.readByte();
    attributes.commentaryId = parser.readUShort(); // 2 bytes
    attributes.assetName = parser.readSizedString(0x2A); // 42 bytes

  } catch (error) {
    console.warn('Error parsing attributes:', error.message);
    // Return partial attributes on error
  }

  return attributes;
}

/**
 * Detect game version from header product string
 * @param {Object} header - Parsed header
 * @returns {number} Game version (25, 26, etc.) or null
 */
function detectMaddenVersion(header) {
  if (!header.product) return null;

  const match = header.product.match(/Madden-(\d+)/);
  if (match) {
    return parseInt(match[1]);
  }

  // Fallback: check year
  if (header.year === 2024) return 25;
  if (header.year === 2025) return 26;

  return null;
}

module.exports = {
  parseHeader,
  parseProspects,
  parseProspect,
  parseVisualData,
  parseAttributeData,
  detectMaddenVersion,
  MAX_ENTRY_SIZE,
  MAX_VISUALS_SIZE,
  MAX_PLAYER_DATA_SIZE
};
