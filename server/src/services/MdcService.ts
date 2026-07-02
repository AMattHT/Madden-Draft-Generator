import fs from 'fs';
import { TEMPLATE_M26, MDC_BLOCK_SIZE, MDC_DATA_START } from '../config/paths';

/* Vendored CommonJS .mdc engine — MUST use the 4296/offset M26 model.
   See [[mdc-m26-format-gotcha]]. */
/* eslint-disable @typescript-eslint/no-var-requires */
const M26Parser = require('../vendor/draft-class/M26Parser');
const M26Writer = require('../vendor/draft-class/M26Writer');

/** Run a noisy vendored fn with console silenced (M26Writer logs heavily). */
function silence<T>(fn: () => T): T {
  const c = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = console.error = console.warn = console.info = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, c);
  }
}

export type MdcProspect = Record<string, unknown>;

export const MdcService = {
  loadTemplate(): Buffer {
    return fs.readFileSync(TEMPLATE_M26);
  },

  /** Physical block capacity of a buffer (template is ~455; class fills first N). */
  capacity(buf?: Buffer): number {
    const b = buf ?? this.loadTemplate();
    return Math.floor((b.length - MDC_DATA_START) / MDC_BLOCK_SIZE);
  },

  parse(buf: Buffer): MdcProspect[] {
    return silence(() => M26Parser.parseM26Prospects(buf, { dataStartOffset: MDC_DATA_START }));
  },

  /** Write prospects (block i = pick i) into a copy of the template buffer. */
  write(prospects: MdcProspect[], templateBuf?: Buffer): Buffer {
    const b = templateBuf ?? this.loadTemplate();
    return silence(() =>
      M26Writer.writeM26DraftClass(b, prospects, { dataStartOffset: MDC_DATA_START })
    );
  },
};
