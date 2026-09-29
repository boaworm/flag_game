/**
 * Comparing a typed answer to a country name.
 *
 * Kids misspell, use the native name, skip the accents, and type lowercase. The
 * rule is: normalize hard, then allow a small edit distance that scales with the
 * length of the name — so "Portugual" counts but "Chad" does not become "Chile".
 */

/** Reduce a name to its comparable form: no case, no accents, no punctuation. */
export const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Levenshtein distance, iterative with a single row of state. */
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/** How far off a spelling may be before it stops counting as the same name. */
const tolerance = (name) => (name.length <= 5 ? 0 : name.length <= 9 ? 1 : 2);

/**
 * Does `input` name this country?
 *
 * Returns `{ correct, matched, exact }` — `matched` is the accepted name it hit,
 * so the caller can show the right spelling after a near miss.
 */
export function matchesName(input, acceptedNames) {
  const typed = normalize(input);
  if (!typed) return { correct: false, matched: null, exact: false };

  let best = null;

  for (const name of acceptedNames) {
    const candidate = normalize(name);
    if (candidate === typed) return { correct: true, matched: name, exact: true };

    const distance = editDistance(typed, candidate);
    if (distance <= tolerance(candidate) && (!best || distance < best.distance)) {
      best = { name, distance };
    }
  }

  return best
    ? { correct: true, matched: best.name, exact: false }
    : { correct: false, matched: null, exact: false };
}
