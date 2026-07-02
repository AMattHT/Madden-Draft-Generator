/**
 * DraftClassParser - Main API for reading and writing Madden draft class files
 * Source: Inspired by madden-draft-class-tools by WiiExpertise (GPL-3.0)
 *          and madden-franchise by bep713 (MIT License)
 *
 * Supports both Madden 25 (gzip) and Madden 26 (zstd) formats
 */

const fs = require('fs');
const FileParser = require('./FileParser');
const { detectCompression } = require('./Decompressor');
const {
  parseHeader,
  parseProspects,
  detectMaddenVersion
} = require('./draftClassFunctions');

/**
 * Read and parse a draft class file
 * @param {string|Buffer} input - File path or buffer
 * @returns {Object} Parsed draft class data
 */
function readDraftClass(input) {
  // Load file buffer
  let buffer;
  if (typeof input === 'string') {
    buffer = fs.readFileSync(input);
  } else if (Buffer.isBuffer(input)) {
    buffer = input;
  } else {
    throw new Error('Input must be a file path (string) or Buffer');
  }

  // Create parser
  const parser = new FileParser(buffer);

  // Parse header
  const header = parseHeader(parser);

  // Detect game version
  const gameVersion = detectMaddenVersion(header);

  // Detect compression type (check first player record)
  const firstPlayerSample = buffer.subarray(header.dataStartOffset, header.dataStartOffset + 100);
  const compressionType = detectCompression(firstPlayerSample);

  // Parse all prospects
  const prospects = parseProspects(parser, header);

  return {
    header: {
      signature: header.signature,
      version: header.version,
      year: header.year,
      product: header.product,
      gameVersion,
      compressionType,
      dataStartOffset: header.dataStartOffset
    },
    prospects,
    meta: {
      fileSize: buffer.length,
      prospectCount: prospects.length,
      estimatedProspects: header.estimatedProspects,
      compressionDetected: compressionType
    }
  };
}

/**
 * Write draft class data to file
 * NOTE: This is a placeholder implementation. Writing binary draft class files
 * requires precise knowledge of all byte offsets and data structures.
 * Use with caution and test thoroughly.
 *
 * @param {Object} draftClass - Draft class data to write
 * @param {string} outputPath - Output file path
 */
function writeDraftClass(draftClass, outputPath) {
  throw new Error('writeDraftClass not yet implemented - requires precise binary serialization');

  // TODO: Implement writing logic
  // 1. Create buffer with correct size
  // 2. Write FBCHUNKS header
  // 3. For each prospect:
  //    - Serialize visual JSON
  //    - Compress if needed (gzip for M25, zstd for M26)
  //    - Write to 4096-byte visual section
  //    - Serialize binary attributes
  //    - Write to 1226-byte attribute section
  // 4. Write buffer to file
}

/**
 * Validate draft class file format
 * @param {string|Buffer} input - File path or buffer
 * @returns {Object} Validation result
 */
function validateDraftClass(input) {
  try {
    // Load file buffer
    let buffer;
    if (typeof input === 'string') {
      buffer = fs.readFileSync(input);
    } else if (Buffer.isBuffer(input)) {
      buffer = input;
    } else {
      return {
        valid: false,
        error: 'Input must be a file path (string) or Buffer'
      };
    }

    // Check minimum file size
    if (buffer.length < 100) {
      return {
        valid: false,
        error: 'File too small to be a valid draft class'
      };
    }

    // Check FBCHUNKS signature
    const signature = buffer.toString('ascii', 0, 8);
    if (signature !== 'FBCHUNKS') {
      return {
        valid: false,
        error: `Invalid signature: "${signature}" (expected "FBCHUNKS")`
      };
    }

    // Read version
    const version = buffer.readUInt8(8);

    // Read year
    const year = buffer.readUInt16LE(0x16);

    // Read product string
    let product = '';
    let offset = 0x22;
    while (offset < 0x40 && buffer[offset] !== 0) {
      product += String.fromCharCode(buffer[offset]);
      offset++;
    }

    // Detect compression
    const dataSample = buffer.subarray(0x4C, 0x4C + 100);
    const compressionType = detectCompression(dataSample);

    return {
      valid: true,
      signature,
      version,
      year,
      product,
      compressionType,
      fileSize: buffer.length
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Get summary information about a draft class file
 * @param {string|Buffer} input - File path or buffer
 * @returns {Object} Summary information
 */
function getDraftClassInfo(input) {
  const validation = validateDraftClass(input);

  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error
    };
  }

  try {
    const draftClass = readDraftClass(input);

    return {
      valid: true,
      header: draftClass.header,
      prospectCount: draftClass.prospects.length,
      fileSize: draftClass.meta.fileSize,
      compressionType: draftClass.header.compressionType,
      gameVersion: draftClass.header.gameVersion,
      sampleProspects: draftClass.prospects.slice(0, 3).map(p => ({
        name: `${p.firstName || '?'} ${p.lastName || '?'}`,
        position: p.position,
        overall: p.overall,
        college: p.college
      }))
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Export draft class to JSON file
 * @param {string|Buffer} input - Draft class file path or buffer
 * @param {string} outputPath - JSON output file path
 */
function exportToJSON(input, outputPath) {
  const draftClass = readDraftClass(input);
  const json = JSON.stringify(draftClass, null, 2);
  fs.writeFileSync(outputPath, json, 'utf8');
  return draftClass;
}

/**
 * Get attribute definitions for UI rendering
 * @returns {Object} Attribute definitions
 */
function getAttributeDefinitions() {
  return {
    personal: [
      { key: 'firstName', label: 'First Name', type: 'string' },
      { key: 'lastName', label: 'Last Name', type: 'string' },
      { key: 'position', label: 'Position', type: 'number', min: 0, max: 21 },
      { key: 'age', label: 'Age', type: 'number', min: 18, max: 30 },
      { key: 'heightInches', label: 'Height (inches)', type: 'number', min: 65, max: 85 },
      { key: 'weight', label: 'Weight (lbs)', type: 'number', min: 150, max: 400 },
      { key: 'college', label: 'College ID', type: 'number' },
      { key: 'homeTown', label: 'Hometown', type: 'string' },
      { key: 'jerseyNum', label: 'Jersey #', type: 'number', min: 0, max: 99 }
    ],
    ratings: [
      { key: 'overall', label: 'Overall', type: 'number', min: 0, max: 99 },
      { key: 'speed', label: 'Speed', type: 'number', min: 0, max: 99 },
      { key: 'acceleration', label: 'Acceleration', type: 'number', min: 0, max: 99 },
      { key: 'strength', label: 'Strength', type: 'number', min: 0, max: 99 },
      { key: 'awareness', label: 'Awareness', type: 'number', min: 0, max: 99 },
      { key: 'agility', label: 'Agility', type: 'number', min: 0, max: 99 },
      { key: 'jumping', label: 'Jumping', type: 'number', min: 0, max: 99 },
      { key: 'stamina', label: 'Stamina', type: 'number', min: 0, max: 99 },
      { key: 'injury', label: 'Injury', type: 'number', min: 0, max: 99 },
      { key: 'toughness', label: 'Toughness', type: 'number', min: 0, max: 99 }
    ],
    draft: [
      { key: 'draftRound', label: 'Draft Round', type: 'number', min: 1, max: 7 },
      { key: 'draftPick', label: 'Draft Pick', type: 'number', min: 1, max: 32 },
      { key: 'draftable', label: 'Draftable', type: 'number', min: 0, max: 1 }
    ]
  };
}

module.exports = {
  readDraftClass,
  writeDraftClass,
  validateDraftClass,
  getDraftClassInfo,
  exportToJSON,
  getAttributeDefinitions
};
