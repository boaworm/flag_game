/** Random helpers. Nothing here touches game rules — keep those in the modes. */

/** A random integer in [0, max). */
export const randomInt = (max) => Math.floor(Math.random() * max);

/** A random element. */
export const pick = (items) => items[randomInt(items.length)];

/** A shuffled copy, Fisher-Yates. Does not mutate the input. */
export function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Up to `n` distinct random elements. */
export const sample = (items, n) => shuffled(items).slice(0, n);
