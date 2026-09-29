#!/usr/bin/env node
/**
 * Builds the "world" set: the 193 UN member states, their flags' codes, and the
 * map geometry the location modes draw.
 *
 *   node tools/build-world.mjs
 *
 * Dev-only. Its committed output under data/sets/world/ is all the browser loads.
 *
 * Sources:
 *   - mledoze/countries        names, capitals, coordinates (ODbL)
 *   - ne_10m_admin_0_countries country shapes
 *   - ne_10m_land              continent outlines, with no borders in them, so
 *                              the base map cannot give an answer away
 *   - flag-icons               the flag SVGs (MIT)
 *
 * 10m rather than 50m because the set is played zoomed into a single continent
 * as well as at world scale, and 50m coastlines fall apart close up. It also
 * stops the smallest countries from being simplified out of existence.
 */

import { access, mkdir, writeFile } from 'node:fs/promises';
import { boundsOf, coreBounds, isoOf, labelPoint, naturalEarth, prepareRings } from './lib/geojson.mjs';

const COUNTRIES =
  'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';

/** Simplification tolerance in degrees. 0.02° is about 2 km. */
const TOLERANCE = 0.02;

/** Rings below this area in square degrees are dropped — but never the largest. */

/** The source marks the Holy See as a UN member; it is a permanent observer. */
const NOT_UN_MEMBERS = new Set(['VA']);

/**
 * Continents to play by. The source splits the world into five regions, which
 * leaves the Americas as one enormous group; the game offers them separately.
 */
function continentOf({ region, subregion }) {
  if (region !== 'Americas') return region;
  return subregion === 'South America' ? 'South America' : 'North America';
}

const normalize = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

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
    // altSpellings carries bare country codes; typing a code is not knowing it.
    if (!name || name.length < 4) continue;
    const key = normalize(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

const response = await fetch(COUNTRIES);
if (!response.ok) throw new Error(`countries: HTTP ${response.status}`);

const entries = (await response.json())
  .filter((c) => c.unMember && !NOT_UN_MEMBERS.has(c.cca2))
  .map((c) => ({
    code: c.cca2.toLowerCase(),
    name: c.name.common,
    officialName: c.name.official,
    group: continentOf({ region: c.region, subregion: c.subregion }),
    subregion: c.subregion || null,
    capital: c.capital?.[0] ?? null,
    coordinates: c.latlng,
    area: c.area,
    acceptedNames: acceptedNames(c),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// The UN has 193 member states. If this trips, the source changed and the list
// needs a look rather than a silently different game.
if (entries.length !== 193) {
  throw new Error(`Expected 193 UN member states, got ${entries.length}.`);
}

console.log('Fetching Natural Earth 10m (this is a large download)…');
const [countryLayer, landLayer] = await Promise.all([
  naturalEarth('ne_10m_admin_0_countries'),
  naturalEarth('ne_10m_land'),
]);

const features = new Map();
for (const feature of countryLayer.features) {
  const iso = isoOf(feature.properties);
  if (iso && !features.has(iso)) features.set(iso, feature);
}

const missing = entries.filter((e) => !features.has(e.code));
if (missing.length) throw new Error(`No shape for: ${missing.map((e) => e.name).join(', ')}`);

const shapes = {};
for (const entry of entries) {
  const rings = prepareRings(features.get(entry.code).geometry, {
    tolerance: TOLERANCE,
  });
  if (!rings.length) throw new Error(`${entry.name} simplified away to nothing.`);
  shapes[entry.code] = { rings, bounds: boundsOf(rings), core: coreBounds(rings), point: labelPoint(rings) };
}

const land = landLayer.features.flatMap((f) =>
  prepareRings(f.geometry, { tolerance: TOLERANCE}),
);

/**
 * The area each continent option zooms to.
 *
 * Deliberately a table rather than a bounding box over the members, because the
 * bounding box is wrong in ways no formula fixes. Norway owns Bouvet Island near
 * Antarctica and France owns Réunion, so Europe's box reached the southern
 * ocean; Russia reaches the Bering Strait, so it reached 188° east as well; and
 * Oceania straddles the antimeridian, where a box spans the whole globe. What a
 * continent looks like on a map is a cartographic choice, so it is made here and
 * checked below.
 *
 * Longitudes may run past 180: Oceania is 110° east to 200°, that is 160° west.
 * The renderer shifts points west of a view's start by 360° to match.
 */
const VIEWS = {
  All: [-180, -58, 180, 84],
  Africa: [-26, -37, 62, 39],
  Asia: [25, -11, 150, 57],
  Europe: [-25, 34, 45, 72],
  'North America': [-172, 5, -52, 75],
  'South America': [-82, -56, -34, 13],
  Oceania: [110, -50, 200, 10],
};

/**
 * Countries that genuinely do not fit their continent's frame. Each is
 * transcontinental or holds distant territory, and is listed here so that the
 * check below stays meaningful for everyone else — a country that starts
 * falling outside its frame by accident will still be caught.
 */
const OFF_FRAME = new Set([
  'ru', // Siberia runs to the Bering Strait; European Russia is in frame
  'us', // Alaska and Hawaii sit outside the North America frame
  'ki', // Kiribati spans the antimeridian and the equator
  'fr', // French Guiana, Réunion and the Pacific territories
  'nl', // Caribbean Netherlands
  'nz', // the Kermadecs and subantarctic islands
  'cl', // Easter Island
  'ec', // the Galápagos
]);

const groups = {};
for (const entry of entries) (groups[entry.group] ??= []).push(entry);

for (const name of Object.keys(groups)) {
  if (!VIEWS[name]) throw new Error(`No view defined for continent "${name}".`);
}

// Every country must be findable inside its continent's frame, or be listed as a
// known exception. This is what keeps the table above honest.
const strays = [];
for (const entry of entries) {
  if (OFF_FRAME.has(entry.code)) continue;
  const [lonMin, latMin, lonMax, latMax] = VIEWS[entry.group];
  const [lat, lon] = entry.coordinates;
  const shifted = lon < lonMin ? lon + 360 : lon;
  if (shifted < lonMin || shifted > lonMax || lat < latMin || lat > latMax) {
    strays.push(`${entry.name} (${entry.group}, at ${lat}, ${lon})`);
  }
}
if (strays.length) {
  throw new Error(`Outside their continent's frame:\n  ${strays.join('\n  ')}`);
}

const views = VIEWS;

/**
 * Flags, from the flag-icons project via a CDN, one 4:3 SVG per country named by
 * its ISO code. Files already present are left alone, so this is resumable;
 * delete assets/flags/world/ to force a refresh.
 */
const FLAG_VERSION = '7.5.0';
const flagDir = new URL('../assets/flags/world/', import.meta.url);
await mkdir(flagDir, { recursive: true });

let downloaded = 0;
let kept = 0;
for (const entry of entries) {
  const target = new URL(`${entry.code}.svg`, flagDir);
  try {
    await access(target);
    kept += 1;
    continue;
  } catch {
    // Not downloaded yet.
  }
  const url =
    `https://cdn.jsdelivr.net/npm/flag-icons@${FLAG_VERSION}/flags/4x3/${entry.code}.svg`;
  const flag = await fetch(url);
  if (!flag.ok) throw new Error(`Flag for ${entry.name}: HTTP ${flag.status}`);
  await writeFile(target, await flag.text());
  downloaded += 1;
}
console.log(`Flags: ${downloaded} downloaded, ${kept} already present`);

const dir = new URL('../data/sets/world/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('entries.json', dir), `${JSON.stringify(entries, null, 2)}\n`);
await writeFile(
  new URL('map.json', dir),
  `${JSON.stringify({ projection: 'equirectangular', land, shapes, views })}\n`,
);

const points = Object.values(shapes).reduce(
  (n, s) => n + s.rings.reduce((m, r) => m + r.length / 2, 0), 0);
console.log(`\n${entries.length} countries, ${points.toLocaleString()} shape points`);
console.log(`${land.length} land rings, ${land.reduce((n, r) => n + r.length / 2, 0).toLocaleString()} points`);
for (const [name, b] of Object.entries(views).sort()) {
  const n = name === 'All' ? entries.length : groups[name].length;
  console.log(`  ${name.padEnd(15)} ${String(n).padStart(3)} countries  lon ${String(Math.round(b[0])).padStart(5)}..${String(Math.round(b[2])).padEnd(5)} lat ${String(Math.round(b[1])).padStart(4)}..${Math.round(b[3])}`);
}
