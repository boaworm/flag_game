/** Player settings, remembered between sessions. */

import { read, write } from './lib/storage.js';

const KEY = 'flag-game.settings';

/** Choices offered in the multiple-choice modes. */
export const CHOICE_COUNTS = [2, 3, 4, 6, 8];

/** Pairs offered in match mode. More than eight stops fitting on a phone. */
export const PAIR_COUNTS = [4, 6, 8];

const DEFAULTS = {
  set: 'world',
  group: 'All',
  choiceCount: 4,
  /** 'choices' | 'typed' — how the naming modes ask for the answer. */
  answerStyle: 'choices',
  pairCount: 6,
  questionsPerRound: 10,
};

let current = { ...DEFAULTS, ...read(KEY, {}) };

export const getSettings = () => ({ ...current });

export function updateSettings(patch) {
  current = { ...current, ...patch };
  // Groups belong to a set, so switching sets cannot keep the old one.
  if (patch.set) current.group = 'All';
  write(KEY, current);
  return getSettings();
}
