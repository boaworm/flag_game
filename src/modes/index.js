/**
 * The mode registry. `main.js` starts whatever is listed here, so adding a mode is
 * a matter of writing it and adding it to this list.
 */

import guessTheFlag from './guess-the-flag.js';
import guessThePlace from './guess-the-place.js';
import matchUp from './match-up.js';
import pointToCountry from './point-to-country.js';
import { placeTheShape, shapeStreak } from './place-the-shape.js';

export const modes = [
  guessTheFlag,
  guessThePlace,
  matchUp,
  pointToCountry,
  placeTheShape,
  shapeStreak,
];

export const modeById = (id) => modes.find((m) => m.id === id) ?? null;
