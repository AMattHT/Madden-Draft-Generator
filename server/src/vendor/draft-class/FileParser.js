/**
 * FileParser - Binary buffer parsing utility with offset tracking
 * Source: Adapted from madden-draft-class-tools by WiiExpertise (GPL-3.0)
 *
 * Provides stream-based binary buffer parsing with automatic offset management
 */

class FileParser {
  /**
   * Create a new FileParser
   * @param {Buffer} buffer - The buffer to parse
   */
  constructor(buffer) {
    this.buffer = buffer;
    this._offset = 0;
  }

  /**
   * Get current offset position
   * @returns {number}
   */
  get offset() {
    return this._offset;
  }

  /**
   * Set offset position
   * @param {number} value
   */
  set offset(value) {
    if (value < 0 || value > this.buffer.length) {
      throw new Error(`Invalid offset: ${value} (buffer length: ${this.buffer.length})`);
    }
    this._offset = value;
  }

  /**
   * Read raw bytes and advance offset
   * @param {number} length - Number of bytes to read
   * @returns {Buffer}
   */
  readBytes(length) {
    if (this._offset + length > this.buffer.length) {
      throw new Error(`Cannot read ${length} bytes at offset ${this._offset} (buffer length: ${this.buffer.length})`);
    }
    const bytes = this.buffer.subarray(this._offset, this._offset + length);
    this._offset += length;
    return bytes;
  }

  /**
   * Read single byte (uint8)
   * NOTE: Reference implementation returns a Buffer from readByte() which then calls .readUInt8()
   * We simplify by returning the value directly
   * @returns {number}
   */
  readByte() {
    if (this._offset >= this.buffer.length) {
      throw new Error(`Cannot read byte at offset ${this._offset} (buffer length: ${this.buffer.length})`);
    }
    const value = this.buffer.readUInt8(this._offset);
    this._offset += 1;
    return value;
  }

  /**
   * Read uint16 (2 bytes)
   * @param {boolean} bigEndian - Use big-endian byte order (default: little-endian)
   * @returns {number}
   */
  readUShort(bigEndian = false) {
    const value = bigEndian
      ? this.buffer.readUInt16BE(this._offset)
      : this.buffer.readUInt16LE(this._offset);
    this._offset += 2;
    return value;
  }

  /**
   * Read uint32 (4 bytes)
   * @param {boolean} bigEndian - Use big-endian byte order (default: little-endian)
   * @returns {number}
   */
  readUInt(bigEndian = false) {
    const value = bigEndian
      ? this.buffer.readUInt32BE(this._offset)
      : this.buffer.readUInt32LE(this._offset);
    this._offset += 4;
    return value;
  }

  /**
   * Read null-terminated string (reads until null byte encountered)
   * @param {string} encoding - Text encoding (default: 'utf8')
   * @returns {string}
   */
  readNullTerminatedString(encoding = 'utf8') {
    let endOffset = this._offset;
    while (endOffset < this.buffer.length && this.buffer[endOffset] !== 0) {
      endOffset++;
    }

    const str = this.buffer.toString(encoding, this._offset, endOffset);
    this._offset = endOffset + 1; // Skip null terminator
    return str;
  }

  /**
   * Read fixed-length string
   * @param {number} length - Number of bytes to read
   * @param {string} encoding - Text encoding (default: 'utf8')
   * @returns {string}
   */
  readSizedString(length, encoding = 'utf8') {
    const bytes = this.readBytes(length);
    // Remove null bytes from string
    const nullIndex = bytes.indexOf(0);
    const endIndex = nullIndex === -1 ? length : nullIndex;
    return bytes.toString(encoding, 0, endIndex);
  }

  /**
   * Align offset to boundary (pad to alignment)
   * @param {number} alignment - Byte alignment (e.g., 4 for 4-byte alignment)
   */
  pad(alignment) {
    const remainder = this._offset % alignment;
    if (remainder !== 0) {
      this._offset += (alignment - remainder);
    }
  }

  /**
   * Peek at bytes without advancing offset
   * @param {number} length - Number of bytes to peek
   * @returns {Buffer}
   */
  peekBytes(length) {
    if (this._offset + length > this.buffer.length) {
      throw new Error(`Cannot peek ${length} bytes at offset ${this._offset}`);
    }
    return this.buffer.subarray(this._offset, this._offset + length);
  }

  /**
   * Check if we can read more bytes
   * @param {number} length - Number of bytes to check
   * @returns {boolean}
   */
  canRead(length) {
    return this._offset + length <= this.buffer.length;
  }

  /**
   * Get remaining bytes in buffer
   * @returns {number}
   */
  get remaining() {
    return this.buffer.length - this._offset;
  }

  /**
   * Check if at end of buffer
   * @returns {boolean}
   */
  get isEOF() {
    return this._offset >= this.buffer.length;
  }
}

module.exports = FileParser;
