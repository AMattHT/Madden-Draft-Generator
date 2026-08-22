import fs from 'fs';
import { TEMPLATE_M27, M27_BLOCK_SIZE, M27_DATA_START } from '../config/paths';

/* Vendored CommonJS M27 engine (5876-byte records, uncompressed visual JSON). */
/* eslint-disable @typescript-eslint/no-var-requires */
const M27Parser = require('../vendor/draft-class/M27Parser');
const M27Writer = require('../vendor/draft-class/M27Writer');

export type M27Prospect = Record<string, unknown>;

/** Madden 27 .mdc I/O — mirrors MdcService for the M27 record layout. */
export const Mdc27Service = {
  loadTemplate(): Buffer {
    return fs.readFileSync(TEMPLATE_M27);
  },

  capacity(buf?: Buffer): number {
    const b = buf ?? this.loadTemplate();
    return Math.floor((b.length - M27_DATA_START) / M27_BLOCK_SIZE);
  },

  parse(buf: Buffer): M27Prospect[] {
    return M27Parser.parseM27Prospects(buf, { dataStartOffset: M27_DATA_START });
  },

  /** Write prospects (block i = pick i) into a copy of the template buffer. */
  write(prospects: M27Prospect[], templateBuf?: Buffer): Buffer {
    const b = templateBuf ?? this.loadTemplate();
    return M27Writer.writeM27DraftClass(b, prospects, { dataStartOffset: M27_DATA_START });
  },
};
