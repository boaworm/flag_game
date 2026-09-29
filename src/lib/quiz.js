/**
 * The round engine shared by every mode: which country gets asked, what the wrong
 * options are, and what the score is. Modes handle presentation, not selection.
 */

import { pick, sample, shuffled } from './random.js';

/**
 * Wrong options that are actually tempting.
 *
 * Drawing uniformly from 193 countries makes an easy question at any choice count,
 * because the odds of a plausible neighbour appearing are low. Prefer the same
 * subregion, then the same region, and only then fall back to anywhere.
 */
export function distractors(answer, pool, count) {
  const others = pool.filter((c) => c.iso2 !== answer.iso2);

  const tiers = [
    others.filter((c) => c.subregion && c.subregion === answer.subregion),
    others.filter((c) => c.region === answer.region),
    others,
  ];

  const chosen = [];
  const taken = new Set();

  for (const tier of tiers) {
    for (const candidate of shuffled(tier)) {
      if (chosen.length >= count) return chosen;
      if (taken.has(candidate.iso2)) continue;
      taken.add(candidate.iso2);
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
