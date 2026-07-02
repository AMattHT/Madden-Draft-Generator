/**
 * M26 Draft Class Parser
 *
 * Madden 26 uses a different structure from M25:
 * - 4296-byte blocks (0x10C8) per prospect
 * - First 4096 bytes (0x1000): Visual JSON data (appearance)
 * - Last 200 bytes (0xC8): Attribute binary data (player stats)
 * - Fixed block structure - each prospect is exactly one block
 */

const FileParser = require('./FileParser');
const fs = require('fs');
const path = require('path');

const BLOCK_SIZE = 4296; // 0x10C8 - CORRECT value (was incorrectly 4322)
const ATTRIBUTE_DATA_SIZE = 200; // 0xC8 bytes per attribute section (4296 - 4096 = 200)
const JSON_START_MARKER = Buffer.from('{"bodyType"');

/**
 * Parse M26 draft class file
 * @param {Buffer} buffer - File buffer
 * @param {Object} header - Parsed header info
 * @returns {Array} Array of prospect objects
 */
function parseM26Prospects(buffer, header) {
  const prospects = [];

  console.log(`[M26Parser] Starting parse at offset 0x${header.dataStartOffset.toString(16)}`);
  console.log(`[M26Parser] File size: ${buffer.length} bytes`);

  // M26 Structure: Each prospect occupies exactly ONE 4296-byte block (0x10C8)
  // - First 4096 bytes (0x1000): Visual data section (JSON for appearance)
  // - Last 200 bytes (0xC8): Attribute data section (binary player stats)
  // Attributes are ALWAYS at block_start + 0x1000 (4096 bytes)

  const totalProspects = 402; // Fixed capacity in M26 files

  for (let prospectNum = 0; prospectNum < totalProspects; prospectNum++) {
    const blockStart = header.dataStartOffset + (prospectNum * BLOCK_SIZE);
    const attributeOffset = blockStart + 0x1000; // 4096 bytes

    // Check if we're past end of file
    if (attributeOffset + ATTRIBUTE_DATA_SIZE > buffer.length) {
      console.log(`[M26Parser] Reached end of file at prospect ${prospectNum + 1}`);
      break;
    }

    // Try to parse visual JSON (if present)
    // Search for ANY JSON block starting with { (not just {"bodyType")
    // Some prospects start with {"genericHeadName" instead
    let visuals = null;
    let jsonStartIndex = blockStart;
    while (jsonStartIndex < blockStart + 0x1000 && buffer[jsonStartIndex] !== 123) {
      jsonStartIndex++;
    }
    if (jsonStartIndex >= blockStart + 0x1000 || buffer[jsonStartIndex] !== 123) {
      jsonStartIndex = -1;
    }

    if (jsonStartIndex !== -1 && jsonStartIndex < blockStart + 0x1000) {
      // This prospect has visual data
      let braceCount = 0;
      let jsonEnd = -1;

      for (let i = jsonStartIndex; i < buffer.length; i++) {
        const char = String.fromCharCode(buffer[i]);
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }

      if (jsonEnd !== -1) {
        const jsonString = buffer.toString('utf8', jsonStartIndex, jsonEnd);
        try {
          visuals = JSON.parse(jsonString);
          // Debug logging for first 10 prospects to see what fields exist
          if (prospectNum < 10) {
            console.log(`\n[M26Parser] === Prospect #${prospectNum + 1} Visuals ===`);
            console.log('All keys:', Object.keys(visuals));
            console.log('assetName:', visuals.assetName);
            console.log('genericHeadName:', visuals.genericHeadName);
            console.log('bodyType:', visuals.bodyType);
            console.log('Full JSON:', JSON.stringify(visuals, null, 2));
          }
        } catch (e) {
          console.warn(`[M26Parser] Failed to parse visual JSON for prospect ${prospectNum + 1}`);
        }
      }
    }

    // Parse attribute data (at +0x1000 offset from block start)
    const attributeData = buffer.subarray(attributeOffset, attributeOffset + ATTRIBUTE_DATA_SIZE);
    const attributes = parseM26AttributeData(attributeData);

    // Populate PEPS - prioritize BINARY assetName (0x9E) > visuals.assetName > visuals.genericHeadName
    // Binary assetName stores real player faces like "WilliamsCaleb_14500"
    // visuals.genericHeadName stores generic faces like "gen_5_M_M_005"
    if (attributes.assetName) {
      // Binary field has real player asset - use it
      attributes.PEPS = attributes.assetName;
      if (prospectNum < 5) {
        console.log(`[M26Parser] Prospect #${prospectNum + 1} - Using binary assetName: ${attributes.assetName}`);
      }
    } else if (visuals && visuals.assetName) {
      // Fallback to visuals JSON assetName
      attributes.PEPS = visuals.assetName;
      if (prospectNum < 5) {
        console.log(`[M26Parser] Prospect #${prospectNum + 1} - Using visuals.assetName: ${visuals.assetName}`);
      }
    } else if (visuals && visuals.genericHeadName) {
      // Final fallback to generic head
      attributes.PEPS = visuals.genericHeadName;
      if (prospectNum < 5) {
        console.log(`[M26Parser] Prospect #${prospectNum + 1} - Using genericHeadName: ${visuals.genericHeadName}`);
      }
    }

    // Combine visual and attribute data
    const prospect = {
      ...attributes,
      visuals,
      draftPosition: prospectNum, // Track position in file for reordering (0-indexed)
      index: prospectNum // Backward compatibility
    };

    prospects.push(prospect);

    if ((prospectNum + 1) % 100 === 0) {
      console.log(`[M26Parser] Parsed ${prospectNum + 1} prospects...`);
    }
  }

  console.log(`[M26Parser] Completed: ${prospects.length} prospects parsed`);
  return prospects;
}

/**
 * Parse M26 attribute data (DIFFERENT structure from M25!)
 * M26 stores attributes in the last 200 bytes of each 4296-byte block
 * Attribute section starts at block_offset + 0x1000 (4096 bytes)
 *
 * @param {Buffer} attributeData - Attribute buffer (200 bytes, starts at block + 0x1000)
 * @returns {Object} Prospect attributes
 */
function parseM26AttributeData(attributeData) {
  const attributes = {};

  try {
    // String fields - assetName is at 0x9E (42 bytes), read after other attributes
    const firstName = attributeData.toString('ascii', 0, 0x11).replace(/\0/g, '').trim();
    const lastName = attributeData.toString('ascii', 0x11, 0x26).replace(/\0/g, '').trim();
    // HomeTown is 27 bytes (0x1B) at offset 0x27, right after homeState at 0x26
    const homeTown = attributeData.toString('ascii', 0x27, 0x27 + 0x1B).replace(/\0/g, '').trim();

    attributes.firstName = firstName;
    attributes.lastName = lastName;
    attributes.homeTown = homeTown;

    // M26-specific field locations (reverse-engineered through systematic analysis)
    attributes.homeState = attributeData[0x26] || 0;  // Confirmed ✓ (byte before PLACEHOLDER)
    attributes.college = (attributeData[0x42] | (attributeData[0x43] << 8)) || 0;  // UInt16LE (ids reach 493; template stores >255)

    // Birthday stored as YYYYMMDD integer (uint32LE) - not yet mapped correctly
    // TODO: Find correct offset by analyzing hex dumps
    attributes.birthDate = 0;  // Placeholder until correct offset is found

    attributes.age = attributeData[0x46];  // Confirmed ✓
    attributes.heightInches = attributeData[0x47];  // Confirmed ✓
    attributes.weight = attributeData[0x48] + 160;  // Confirmed ✓ (stored as weight-160)
    attributes.position = attributeData[0x4a];  // Confirmed ✓
    attributes.archetype = attributeData[0x4b] || 0;  // Confirmed ✓ (Global archetype ID 0-67)
    attributes.jerseyNum = attributeData[0x4c] || 0;  // Likely jersey or year
    attributes.draftable = attributeData[0x4d] || 1;  // Draft eligible flag
    attributes.draftPick = attributeData[0x4e] || 0;  // Pick number within round (1-32)
    attributes.draftRound = attributeData[0x50] || 0;  // Round number (1-7, or 63 for UDFA)
    attributes.devTrait = attributeData[0x8c] || 0;  // Confirmed ✓ (0=Normal, 1=Star, 2=Superstar, 3=X-Factor)

    // PID (Player ID) - stored at 0x92 as uint16LE
    attributes.PID = attributeData.readUInt16LE(0x92) || 0;  // Confirmed ✓

    // Commentary ID (Presentation ID) - stored at 0x9C as uint16LE (right before assetName)
    attributes.commentaryId = attributeData.readUInt16LE(0x9C) || 0;

    // PEPS (Player Equipment Preset System) - read from binary assetName field at 0x9E (42 bytes)
    // This field stores real player assets like "WilliamsCaleb_14500"
    // Generic assets are stored in visuals.genericHeadName instead
    const binaryAssetName = attributeData.toString('ascii', 0x9E, 0x9E + 42).replace(/\0/g, '').trim();
    attributes.assetName = binaryAssetName || null;  // Store in assetName for later use
    attributes.PEPS = null;  // Will be populated from assetName or visuals.genericHeadName

    // DEBUG: Log what we're reading from binary assetName field
    if (attributes.firstName && (attributes.firstName.includes('Zero') || attributes.lastName?.includes('Ten'))) {
      console.log(`[M26Parser DEBUG] ${attributes.firstName} ${attributes.lastName}:`);
      console.log(`  commentaryId: ${attributes.commentaryId}`);
      console.log(`  binaryAssetName raw: "${binaryAssetName}" (length: ${binaryAssetName?.length || 0})`);
      console.log(`  assetName: ${attributes.assetName}`);
      // Show raw hex of the assetName area
      const hexBytes = [];
      for (let i = 0x9E; i < Math.min(0x9E + 20, attributeData.length); i++) {
        hexBytes.push(attributeData[i].toString(16).padStart(2, '0'));
      }
      console.log(`  assetName hex (first 20 bytes): ${hexBytes.join(' ')}`);
    }

    // M26 Attribute Mapping (reverse-engineered from binary analysis)
    // Ratings are NOT sequential - M26 uses a different byte order than M25
    // Mapped using Garrett Nussmeier & Fernando Mendoza as reference players

    // Core Physical Attributes
    attributes.speed = attributeData[0x7B] || 0;
    attributes.acceleration = attributeData[0x52] || 0;
    attributes.agility = attributeData[0x53] || 0;
    attributes.strength = attributeData[0x7F] || 0;
    attributes.awareness = attributeData[0x54] || 0;
    attributes.jumping = attributeData[0x62] || 0;
    attributes.stamina = attributeData[0x7D] || 0;
    attributes.changeOfDirection = attributeData[0x5C] || 0;
    attributes.toughness = attributeData[0x88] || 0;

    // Ball Carrier Attributes
    attributes.carrying = attributeData[0x59] || 0;
    attributes.ballCarrierVision = attributeData[0x55] || 0;
    attributes.breakTackle = attributeData[0x58] || 0;
    attributes.trucking = attributeData[0x89] || 0;
    attributes.stiffArm = attributeData[0x7E] || 0;
    attributes.spinMove = attributeData[0x7C] || 0;
    attributes.jukeMove = attributeData[0x61] || 0;

    // Receiving Attributes
    attributes.catching = attributeData[0x5A] || 0;
    attributes.catchInTraffic = attributeData[0x5B] || 0;
    attributes.spectacularCatch = attributeData[0x7A] || 0;
    attributes.shortRouteRunning = attributeData[0x75] || 0;
    attributes.mediumRouteRunning = attributeData[0x74] || 0;
    attributes.deepRouteRunning = attributeData[0x73] || 0;
    attributes.release = attributeData[0x72] || 0;

    // Throwing Attributes (QB)
    attributes.throwPower = attributeData[0x86] || 0; // CORRECT: Game reads throwPower from 0x86
    attributes.throwAccuracyShort = attributeData[0x84] || 0;
    attributes.throwAccuracyMid = attributeData[0x82] || 0;  // CONFIRMED: 0x82 is TAM (original file analysis)
    attributes.throwAccuracyDeep = attributeData[0x81] || 0;
    attributes.throwOnTheRun = attributeData[0x85] || 0;
    attributes.throwUnderPressure = attributeData[0x87] || 0;
    attributes.playAction = attributeData[0x6D] || 0;
    attributes.breakSack = attributeData[0x57] || 0;

    // Blocking Attributes
    attributes.passBlock = attributeData[0x6B] || 0;
    attributes.passBlockPower = attributeData[0x69] || 0;
    attributes.passBlockFinesse = attributeData[0x6A] || 0;
    attributes.runBlock = attributeData[0x78] || 0;
    attributes.runBlockPower = attributeData[0x77] || 0;
    attributes.runBlockFinesse = attributeData[0x76] || 0;
    attributes.leadBlock = attributeData[0x66] || 0;
    attributes.impactBlocking = attributeData[0x5F] || 0;
    attributes.injury = attributeData[0x60]; // CORRECT: Game reads injury from 0x60

    // Defensive Attributes
    attributes.tackle = attributeData[0x80] || 0;
    attributes.hitPower = attributeData[0x5E] || 0;
    attributes.powerMoves = attributeData[0x6F] || 0;
    attributes.finesseMoves = attributeData[0x5D] || 0;
    attributes.blockShedding = attributeData[0x56] || 0;
    attributes.pursuit = attributeData[0x71] || 0;
    attributes.playRecognition = attributeData[0x6E] || 0;
    attributes.manCoverage = attributeData[0x68] || 0;
    attributes.zoneCoverage = attributeData[0x8A] || 0;
    attributes.pressCoverage = attributeData[0x70] || 0;

    // Special Teams
    attributes.kickPower = attributeData[0x64] || 0;
    attributes.kickAccuracy = attributeData[0x63] || 0;
    attributes.kickReturn = attributeData[0x65] || 0;
    attributes.longSnap = attributeData[0x8B] || 0; // Long snap at 0x8B (was incorrectly 0x50 which is draftRound)

    // Read overall rating from 0x51 (game stores OVR here)
    attributes.overall = attributeData[0x51] || 0;

    // CRITICAL: Add field code aliases for OVR calculation
    // OVRWeightsCalculator expects field codes (PSPD, PTHP, etc.) not human-readable names
    // These aliases allow the calculator to find attributes correctly

    // Core Physical - map human-readable to field codes
    attributes.PSPD = attributes.speed;
    attributes.PACC = attributes.acceleration;
    attributes.PAGI = attributes.agility;
    attributes.PSTR = attributes.strength;
    attributes.PAWR = attributes.awareness;
    attributes.PJMP = attributes.jumping;
    attributes.PSTA = attributes.stamina;
    attributes.PELU = attributes.changeOfDirection;  // ChangeOfDirection -> PELU
    attributes.PTGH = attributes.toughness;
    attributes.PINJ = attributes.injury;

    // Ball Carrier
    attributes.PCAR = attributes.carrying;
    attributes.PBCV = attributes.ballCarrierVision;
    attributes.PBKT = attributes.breakTackle;
    attributes.PLTR = attributes.trucking;
    attributes.PLSA = attributes.stiffArm;
    attributes.PLSM = attributes.spinMove;
    attributes.PLJM = attributes.jukeMove;

    // Receiving
    attributes.PCTH = attributes.catching;
    attributes.PLCI = attributes.catchInTraffic;
    attributes.PLSC = attributes.spectacularCatch;
    attributes.SRRN = attributes.shortRouteRunning;
    attributes.PMRR = attributes.mediumRouteRunning;
    attributes.PDRR = attributes.deepRouteRunning;
    attributes.PLRL = attributes.release;

    // Throwing (QB)
    attributes.PTHP = attributes.throwPower;
    attributes.PTAS = attributes.throwAccuracyShort;
    attributes.PTAM = attributes.throwAccuracyMid;
    attributes.PTAD = attributes.throwAccuracyDeep;
    attributes.PTOR = attributes.throwOnTheRun;
    attributes.PTUP = attributes.throwUnderPressure;
    attributes.PPLA = attributes.playAction;
    attributes.PBSK = attributes.breakSack;

    // Blocking
    attributes.PPBK = attributes.passBlock;
    attributes.PPBS = attributes.passBlockPower;
    attributes.PPBF = attributes.passBlockFinesse;
    attributes.PRBK = attributes.runBlock;
    attributes.PRBS = attributes.runBlockPower;
    attributes.PRBF = attributes.runBlockFinesse;
    attributes.PLBK = attributes.leadBlock;
    attributes.PLIB = attributes.impactBlocking;

    // Defensive
    attributes.PTAK = attributes.tackle;
    attributes.PLHT = attributes.hitPower;
    attributes.PLPM = attributes.powerMoves;
    attributes.PFMS = attributes.finesseMoves;
    attributes.PBSG = attributes.blockShedding;
    attributes.PLPU = attributes.pursuit;
    attributes.PLPR = attributes.playRecognition;
    attributes.PLMC = attributes.manCoverage;
    attributes.PLZC = attributes.zoneCoverage;
    attributes.PLPE = attributes.pressCoverage;

    // Special Teams
    attributes.PKPR = attributes.kickPower;
    attributes.PKAC = attributes.kickAccuracy;
    attributes.PKRT = attributes.kickReturn;

    // Position field code (PPOS)
    attributes.PPOS = attributes.position;

    // Archetype field code (PLTY)
    attributes.PLTY = attributes.archetype;

    // Overall field code (POVR)
    attributes.POVR = attributes.overall;

  } catch (error) {
    console.error('[M26Parser] Error parsing attribute data:', error.message);
  }

  return attributes;
}

module.exports = {
  parseM26Prospects,
  parseM26AttributeData
};
