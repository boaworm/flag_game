/** A small flag beside the place being asked about. */

import { el } from './dom.js';

export const flagChip = (src) =>
  el('img.chip-flag', { src, alt: '', width: 48, height: 36 });
