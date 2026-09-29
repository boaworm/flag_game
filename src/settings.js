/** Player settings, remembered between sessions. */

import { read, write } from './lib/storage.js';

const KEY = 'flag-game.settings';

export const REGIONS = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

/** Choices offered in the multiple-choice modes. */
export const CHOICE_COUNTS = [2, 3, 4, 6, 8];

const DEFAULTS = {
  region: 'All',
  choiceCount: 4,
  /** 'choices' | 'typed' — how mode 1 asks for the answer. */
  answerStyle: 'choices',
  questionsPerRound: 10,
};

let current = { ...DEFAULTS, ...read(KEY, {}) };

export const getSettings = () => ({ ...current });

export function updateSettings(patch) {
  current = { ...current, ...patch };
  write(KEY, current);
  return getSettings();
}
