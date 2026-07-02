/**
 * M25 to M26 Draft Class Converter
 *
 * Converts Madden 25 draft class files to Madden 26 format
 *
 * Strategy:
 * 1. Parse M25 file to extract prospect data
 * 2. Load M26 template file (any existing M26 draft class)
 * 3. Overwrite template's prospect data with M25 data
 * 4. Save using M26Writer
 *
 * This approach avoids compression/format issues by using a valid M26 file
 * as the structure template and only modifying the prospect data.
 */

const fs = require('fs');
const path = require('path');

/**
 * Convert M25 draft class to M26 format
 * @param {string} inputPath - Path to M25 draft class file
 * @param {string} outputPath - Path for M26 output file
 * @param {string} templatePath - Path to M26 template file (optional)
 * @returns {Object} Conversion result with success status
 */
function convertM25toM26(inputPath, outputPath, templatePath = null) {
  console.log('[M25toM26Converter] Starting conversion');
  console.log(`  Input (M25): ${inputPath}`);
  console.log(`  Output (M26): ${outputPath}`);
  console.log(`  Template: ${templatePath || 'Will use embedded template'}`);

  try {
    // Step 1: Parse M25 file using madden-draft-class-tools
    console.log('[M25toM26Converter] Step 1: Parsing M25 file...');
    const { readDraftClass: readM25 } = require('madden-draft-class-tools');
    const m25Buffer = fs.readFileSync(inputPath);
    const m25Data = readM25(m25Buffer);

    console.log(`[M25toM26Converter] Parsed ${m25Data.prospects.length} prospects from M25`);
    console.log(`[M25toM26Converter] Draft Year: ${m25Data.header.draftYear}`);

    // DEBUG: Log first 3 prospects to see what fields we're getting
    console.log('\n[M25toM26Converter] === FIRST 3 PROSPECTS FROM M25 ===');
    for (let i = 0; i < Math.min(3, m25Data.prospects.length); i++) {
      const p = m25Data.prospects[i];
      console.log(`\nProspect #${i + 1}: ${p.firstName} ${p.lastName}`);
      console.log(`  assetName: ${p.assetName}`);
      console.log(`  portraitId: ${p.portraitId}`);
      console.log(`  visuals exists: ${!!p.visuals}`);
      if (p.visuals) {
        console.log(`  visuals.assetName: ${p.visuals.assetName}`);
        console.log(`  visuals.genericHeadName: ${p.visuals.genericHeadName}`);
      }
    }
    console.log('===========================================\n');

    // Step 2: Load M26 template
    console.log('[M25toM26Converter] Step 2: Loading M26 template...');

    if (!templatePath) {
      throw new Error('Template path is required. Please provide path to an existing M26 draft class file.');
    }

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    const templateBuffer = fs.readFileSync(templatePath);
    console.log(`[M25toM26Converter] Loaded template: ${templateBuffer.length} bytes`);

    // Parse template header
    const signature = templateBuffer.toString('ascii', 0, 8);
    if (signature !== 'FBCHUNKS') {
      throw new Error(`Template file is not a valid draft class (signature: ${signature})`);
    }

    const templateHeader = {
      signature,
      version: templateBuffer.readUInt8(8),
      year: templateBuffer.readUInt16LE(0x16),
      product: templateBuffer.toString('ascii', 0x22, 0x46).replace(/\0/g, ''),
      gameVersion: 'M26',
      dataStartOffset: 0x46
    };

    // Parse template prospects to determine count
    const { parseM26Prospects } = require(path.join(__dirname, 'M26Parser'));
    const templateProspects = parseM26Prospects(templateBuffer, templateHeader);
    console.log(`[M25toM26Converter] Template has ${templateProspects.length} prospects`);

    // Step 3: Map M25 prospects to M26 format
    console.log('[M25toM26Converter] Step 3: Mapping prospect data...');
    const m26Prospects = m25Data.prospects.map((prospect, index) => {
      return {
        ...prospect,
        // Map M25 field names to M26
        PID: prospect.portraitId,
        PEPS: prospect.assetName || prospect.visuals?.genericHeadName || null
      };
    });

    // Ensure we don't exceed template capacity
    const maxProspects = templateProspects.length;
    if (m26Prospects.length > maxProspects) {
      console.warn(`[M25toM26Converter] WARNING: M25 has ${m26Prospects.length} prospects but template only supports ${maxProspects}`);
      console.warn(`[M25toM26Converter] Will only convert first ${maxProspects} prospects`);
      m26Prospects.length = maxProspects;
    }

    // Pad with empty prospects if M25 has fewer prospects than template
    while (m26Prospects.length < maxProspects) {
      m26Prospects.push({
        firstName: '',
        lastName: '',
        overall: 50,
        // Add minimal required fields
        position: 0,
        age: 21,
        heightInches: 72,
        weight: 200
      });
    }

    console.log(`[M25toM26Converter] Will write ${m26Prospects.length} prospects to M26 file`);

    // Step 4: Write using M26Writer
    console.log('[M25toM26Converter] Step 4: Writing M26 file...');
    const { writeM26DraftClass } = require(path.join(__dirname, 'M26Writer'));

    const m26Buffer = writeM26DraftClass(
      templateBuffer,
      m26Prospects,
      templateHeader
    );

    fs.writeFileSync(outputPath, m26Buffer);

    console.log('[M25toM26Converter] ✓ Conversion complete');
    console.log(`  Input size: ${m25Buffer.length} bytes`);
    console.log(`  Output size: ${m26Buffer.length} bytes`);
    console.log(`  Prospects converted: ${m26Prospects.length}`);

    return {
      success: true,
      prospectCount: m26Prospects.length,
      inputSize: m25Buffer.length,
      outputSize: m26Buffer.length
    };

  } catch (error) {
    console.error('[M25toM26Converter] ✗ Conversion failed:', error);
    console.error('[M25toM26Converter] Stack:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  convertM25toM26
};
