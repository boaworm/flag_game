/**
 * The mode registry. `main.js` starts whatever is listed here, so adding a mode is
 * a matter of writing it and adding it to this list.
 */

import guessTheFlag from './guess-the-flag.js';

export const modes = [guessTheFlag];

export const modeById = (id) => modes.find((m) => m.id === id) ?? null;
