#!/usr/bin/env node
/**
 * Generates data/countries.json from the mledoze/countries dataset.
 *
 * Dev-only tooling. The game never runs this — its output is committed, and the
 * browser only ever loads the generated JSON. Re-run it to refresh the data:
 *
 *   node tools/build-countries.mjs
 *
 * Scope: the 193 UN member states. That is a defensible, citable line that keeps
 * the game out of arguments about what counts as a country. Territories and
 * partially-recognised states are deliberately excluded for now; revisit as a
 * documented decision, not by quietly widening the filter.
 */

import { writeFile } from 'node:fs/promises';

const SOURCE =
  'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';

/**
 * Corrections to the source data, which marks these as UN members when they are
 * not. The Holy See is a permanent observer state, not a member — including it
 * would put the count at 194.
 */
const NOT_UN_MEMBERS = new Set(['VA']);

/** Strip a name down to the form typed answers are compared against. */
const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Names a player may type for this country, deduplicated on normalized form. */
function acceptedNames(raw) {
  const candidates = [
    raw.name.common,
    raw.name.official,
    ...Object.values(raw.name.native ?? {}).flatMap((n) => [n.common, n.official]),
    ...(raw.altSpellings ?? []),
  ];

  const seen = new Set();
  const names = [];
  for (const name of candidates) {
    // altSpellings carries bare country codes ("SE", "SWE"); typing a code is
    // not knowing the country.
    if (!name || name.length < 4) continue;
    const key = normalize(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`Could not fetch source data: HTTP ${response.status}`);
}

const countries = (await response.json())
  .filter((c) => c.unMember && !NOT_UN_MEMBERS.has(c.cca2))
  .map((c) => ({
    iso2: c.cca2.toLowerCase(),
    name: c.name.common,
    officialName: c.name.official,
    region: c.region,
    subregion: c.subregion || null,
    capital: c.capital?.[0] ?? null,
    coordinates: c.latlng, // [lat, lon], an approximate centroid
    area: c.area, // km², used to scale placement tolerance in mode 3
    acceptedNames: acceptedNames(c),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// The UN has 193 member states. If this trips, the source data changed and the
// country list needs a look rather than a silently different game.
if (countries.length !== 193) {
  throw new Error(`Expected 193 UN member states, got ${countries.length}.`);
}

const missing = countries.filter(
  (c) => !c.name || !c.region || !c.coordinates?.length || !c.acceptedNames.length,
);
if (missing.length) {
  throw new Error(`Incomplete entries: ${missing.map((c) => c.iso2).join(', ')}`);
}

await writeFile(
  new URL('../data/countries.json', import.meta.url),
  `${JSON.stringify(countries, null, 2)}\n`,
);

const perRegion = {};
for (const c of countries) perRegion[c.region] = (perRegion[c.region] ?? 0) + 1;

console.log(`Wrote ${countries.length} countries.`);
for (const [region, n] of Object.entries(perRegion).sort()) {
  console.log(`  ${region}: ${n}`);
}
