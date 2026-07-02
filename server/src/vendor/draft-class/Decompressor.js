/**
 * Decompressor - Handles both gzip (Madden 25) and zstd (Madden 26) decompression
 * Source: Strategy pattern from madden-franchise by bep713 (MIT License)
 *
 * Detects compression type via magic bytes and routes to appropriate decompressor
 */

const zlib = require('zlib');

// Magic bytes for compression detection
const GZIP_MAGIC = Buffer.from([0x1F, 0x8B]);
const ZSTD_MAGIC = Buffer.from([0x28, 0xB5, 0x2F, 0xFD]);

/**
 * Detect compression algorithm used in data
 * @param {Buffer} buffer - Data buffer to check
 * @returns {string} 'gzip', 'zstd', or 'none'
 */
function detectCompression(buffer) {
  // Check for zstd magic bytes (Madden 26)
  if (buffer.indexOf(ZSTD_MAGIC) !== -1) {
    return 'zstd';
  }

  // Check for gzip magic bytes (Madden 25)
  if (buffer.indexOf(GZIP_MAGIC) !== -1) {
    return 'gzip';
  }

  // Check for JSON directly (uncompressed)
  if (buffer.indexOf(Buffer.from('{"')) !== -1 || buffer.indexOf(Buffer.from('{')) !== -1) {
    return 'none';
  }

  return 'unknown';
}

/**
 * Decompress gzip data (Madden 25)
 * @param {Buffer} compressedData - Gzip compressed data
 * @returns {Buffer} Decompressed data
 */
function decompressGzip(compressedData) {
  try {
    // Find gzip magic bytes
    const gzipStart = compressedData.indexOf(GZIP_MAGIC);
    if (gzipStart === -1) {
      throw new Error('Gzip magic bytes not found');
    }

    // Decompress from gzip start position
    const decompressed = zlib.gunzipSync(compressedData.subarray(gzipStart));
    return decompressed;
  } catch (error) {
    throw new Error(`Gzip decompression failed: ${error.message}`);
  }
}

/**
 * Decompress zstd data (Madden 26)
 * Uses fzstd for pure JavaScript zstd decompression
 * Source: fzstd npm package (MIT License)
 *
 * @param {Buffer} compressedData - Zstd compressed data
 * @returns {Buffer} Decompressed data
 */
function decompressZstd(compressedData) {
  try {
    // Import fzstd for zstd decompression
    const { decompress: fzstdDecompress } = require('fzstd');

    // Find zstd magic bytes
    const zstdStart = compressedData.indexOf(ZSTD_MAGIC);
    if (zstdStart === -1) {
      throw new Error('Zstd magic bytes not found');
    }

    // Read compressed length from first 2 bytes (before magic bytes)
    const length = compressedData.readUInt16LE(0);

    // Extract zstd compressed data
    const zstdData = compressedData.subarray(zstdStart, zstdStart + length);

    // Decompress using fzstd
    const decompressed = fzstdDecompress(zstdData);
    return Buffer.from(decompressed);
  } catch (error) {
    throw new Error(`Zstd decompression failed: ${error.message}`);
  }
}

/**
 * Decompress data based on detected algorithm
 * @param {Buffer} compressedData - Compressed data
 * @param {string} compressionType - Optional: specify 'gzip', 'zstd', or 'auto' for detection
 * @returns {Buffer} Decompressed data
 */
function decompress(compressedData, compressionType = 'auto') {
  if (!Buffer.isBuffer(compressedData)) {
    throw new Error('Input must be a Buffer');
  }

  // Auto-detect if needed
  if (compressionType === 'auto') {
    compressionType = detectCompression(compressedData);
  }

  switch (compressionType) {
    case 'gzip':
      return decompressGzip(compressedData);

    case 'zstd':
      return decompressZstd(compressedData);

    case 'none':
      return compressedData;

    default:
      throw new Error(`Unknown compression type: ${compressionType}`);
  }
}

/**
 * Compress data using gzip (for writing Madden 25 files)
 * @param {Buffer} data - Data to compress
 * @returns {Buffer} Compressed data
 */
function compressGzip(data) {
  try {
    return zlib.gzipSync(data);
  } catch (error) {
    throw new Error(`Gzip compression failed: ${error.message}`);
  }
}

/**
 * Compress data using zstd (for writing Madden 26 files)
 * Uses fzstd for pure JavaScript zstd compression
 * Source: fzstd npm package (MIT License)
 *
 * @param {Buffer} data - Data to compress
 * @returns {Buffer} Compressed data
 */
function compressZstd(data) {
  try {
    // Import fzstd for zstd compression
    const { compress: fzstdCompress } = require('fzstd');

    // Compress using fzstd
    const compressed = fzstdCompress(data);
    return Buffer.from(compressed);
  } catch (error) {
    throw new Error(`Zstd compression failed: ${error.message}`);
  }
}

module.exports = {
  decompress,
  detectCompression,
  decompressGzip,
  decompressZstd,
  compressGzip,
  compressZstd,
  GZIP_MAGIC,
  ZSTD_MAGIC
};
