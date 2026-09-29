/**
 * The round engine shared by every mode: which country gets asked, what the wrong
 * options are, and what the score is. Modes handle presentation, not selection.
 */

import { pick, sample, shuffled } from './random.js';

/**
 * Wrong options that are actually tempting.
 *
 * Drawing uniformly from 193 countries makes an easy question at any choice
 * count, because the odds of a plausible neighbour turning up are low. So prefer
 * the narrowest grouping a set offers — the same subregion where there is one,
 * then the same continent or region — and only then fall back to anywhere.
 */
export function distractors(answer, pool, count) {
  const others = pool.filter((entry) => entry.code !== answer.code);

  const tiers = [
    others.filter((entry) => entry.subregion && entry.subregion === answer.subregion),
    others.filter((entry) => entry.group && entry.group === answer.group),
    others,
  ];

  const chosen = [];
  const taken = new Set();

  for (const tier of tiers) {
    for (const candidate of shuffled(tier)) {
      if (chosen.length >= count) return chosen;
      if (taken.has(candidate.code)) continue;
      taken.add(candidate.code);
      chosen.push(candidate);
    }
  }
  return chosen;
}

/**
 * A round of questions over a pool of countries.
 *
 * Questions do not repeat within a round while the pool is big enough to avoid it,
 * so a 10-question round does not ask about Peru three times.
 */
export function createRound({ pool, length }) {
  const order = sample(pool, Math.min(length, pool.length));
  // A pool smaller than the round (a small region, a high question count) tops up
  // rather than cutting the round short.
  while (order.length < length) order.push(pick(pool));

  let index = 0;
  let correct = 0;
  const misses = [];

  return {
    get total() {
      return order.length;
    },
    get number() {
      return index + 1;
    },
    get score() {
      return correct;
    },
    get misses() {
      return [...misses];
    },
    get finished() {
      return index >= order.length;
    },
    /** The country being asked about, or null once the round is over. */
    get current() {
      return order[index] ?? null;
    },
    /** Options for a multiple-choice question: the answer plus `n - 1` distractors. */
    options(n) {
      return shuffled([order[index], ...distractors(order[index], pool, n - 1)]);
    },
    /** Record the outcome and move on. Returns true if the round continues. */
    answer(wasCorrect) {
      if (wasCorrect) correct += 1;
      else misses.push(order[index]);
      index += 1;
      return !this.finished;
    },
  };
}
