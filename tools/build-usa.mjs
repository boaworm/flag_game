#!/usr/bin/env node
/**
 * Builds the "usa" set: the 50 states, their capitals, shapes and flags.
 *
 *   node tools/build-usa.mjs
 *
 * Dev-only. Writes data/sets/usa/ and downloads state flags into
 * assets/flags/usa/. The District of Columbia is left out: it is not a state,
 * and the set is about states and their capitals.
 *
 * Sources:
 *   - ne_10m_admin_1_states_provinces  state shapes, postal codes, census regions
 *   - Wikimedia Commons                state flags
 *   - the capitals table below
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { boundsOf, coreBounds, isoOf, labelPoint, naturalEarth, prepareRings } from './lib/geojson.mjs';

const TOLERANCE = 0.01;

/**
 * State capitals. Reference data, kept here in the builder rather than in the
 * game, where data/sets/usa/entries.json remains the single source of truth.
 */
const CAPITALS = {
  Alabama: 'Montgomery', Alaska: 'Juneau', Arizona: 'Phoenix', Arkansas: 'Little Rock',
  California: 'Sacramento', Colorado: 'Denver', Connecticut: 'Hartford', Delaware: 'Dover',
  Florida: 'Tallahassee', Georgia: 'Atlanta', Hawaii: 'Honolulu', Idaho: 'Boise',
  Illinois: 'Springfield', Indiana: 'Indianapolis', Iowa: 'Des Moines', Kansas: 'Topeka',
  Kentucky: 'Frankfort', Louisiana: 'Baton Rouge', Maine: 'Augusta', Maryland: 'Annapolis',
  Massachusetts: 'Boston', Michigan: 'Lansing', Minnesota: 'Saint Paul', Mississippi: 'Jackson',
  Missouri: 'Jefferson City', Montana: 'Helena', Nebraska: 'Lincoln', Nevada: 'Carson City',
  'New Hampshire': 'Concord', 'New Jersey': 'Trenton', 'New Mexico': 'Santa Fe',
  'New York': 'Albany', 'North Carolina': 'Raleigh', 'North Dakota': 'Bismarck',
  Ohio: 'Columbus', Oklahoma: 'Oklahoma City', Oregon: 'Salem', Pennsylvania: 'Harrisburg',
  'Rhode Island': 'Providence', 'South Carolina': 'Columbia', 'South Dakota': 'Pierre',
  Tennessee: 'Nashville', Texas: 'Austin', Utah: 'Salt Lake City', Vermont: 'Montpelier',
  Virginia: 'Richmond', Washington: 'Olympia', 'West Virginia': 'Charleston',
  Wisconsin: 'Madison', Wyoming: 'Cheyenne',
};

console.log('Reading Natural Earth…');
const [layer, countryLayer] = await Promise.all([
  naturalEarth('ne_10m_admin_1_states_provinces'),
  naturalEarth('ne_10m_admin_0_countries'),
]);

const features = layer.features.filter(
  (f) => f.properties.iso_a2 === 'US' && f.properties.type_en === 'State',
);
if (features.length !== 50) {
  throw new Error(`Expected 50 states, found ${features.length}.`);
}

const shapes = {};
const entries = features
  .map((feature) => {
    const { name, postal, region } = feature.properties;
    const capital = CAPITALS[name];
    if (!capital) throw new Error(`No capital recorded for ${name}.`);

    const rings = prepareRings(feature.geometry, {
      tolerance: TOLERANCE,
      });
    if (!rings.length) throw new Error(`${name} simplified away to nothing.`);

    const code = postal.toLowerCase();
    shapes[code] = { rings, bounds: boundsOf(rings), core: coreBounds(rings), point: labelPoint(rings) };

    return {
      code,
      name,
      group: region,
      capital,
      coordinates: shapes[code].point,
      acceptedNames: [name],
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** Continent-style views, computed from each group's members. */
function viewOf(members) {
  let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
  for (const entry of members) {
    // Largest ring only: Alaska's Aleutians and Hawaii's outer atolls would
    // otherwise stretch a region across the Pacific.
    const [a, b, c, d] = boundsOf([shapes[entry.code].rings[0]]);
    lonMin = Math.min(lonMin, a); latMin = Math.min(latMin, b);
    lonMax = Math.max(lonMax, c); latMax = Math.max(latMax, d);
  }
  const padLon = (lonMax - lonMin) * 0.05;
  const padLat = (latMax - latMin) * 0.05;
  return [lonMin - padLon, latMin - padLat, lonMax + padLon, latMax + padLat]
    .map((n) => Number(n.toFixed(3)));
}

const groups = {};
for (const entry of entries) (groups[entry.group] ??= []).push(entry);

const views = { All: viewOf(entries) };
for (const [name, members] of Object.entries(groups)) views[name] = viewOf(members);

// Flags, from Wikimedia Commons. Each is fetched by its canonical file name.
const flagDir = new URL('../assets/flags/usa/', import.meta.url);
await mkdir(flagDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Commons rate-limits a run of fifty requests, so this waits between them and
 * backs off when asked to. Flags already on disk are left alone, which makes the
 * download resumable — delete assets/flags/usa/ to force a refresh.
 */
async function fetchFlag(entry) {
  const file = `Flag_of_${entry.name.replace(/ /g, '_')}.svg`;
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${file}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'flag_game build (https://github.com/boaworm/flag_game)' },
    });
    if (response.ok) return response.text();
    if (response.status !== 429) throw new Error(`${entry.name}: HTTP ${response.status}`);
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`${entry.name}: still rate-limited after five attempts.`);
}

console.log('Fetching state flags from Wikimedia Commons…');
let downloaded = 0;
let kept = 0;
for (const entry of entries) {
  const target = new URL(`${entry.code}.svg`, flagDir);
  try {
    await (await import('node:fs/promises')).access(target);
    kept += 1;
    continue;
  } catch {
    // Not downloaded yet.
  }
  await writeFile(target, await fetchFlag(entry));
  downloaded += 1;
  await sleep(400);
}

/**
 * The base map: the national outline, taken from the admin-0 layer.
 *
 * It has to come from there rather than from the states themselves. Drawing the
 * fifty state shapes would draw the state borders, which is the one thing the
 * base map must not show — every answer would be traceable straight off it.
 */
const usFeature = countryLayer.features.find((f) => isoOf(f.properties) === 'us');
if (!usFeature) throw new Error('No United States outline in the admin-0 layer.');
const land = prepareRings(usFeature.geometry, {
  tolerance: TOLERANCE,
});

const dir = new URL('../data/sets/usa/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('entries.json', dir), `${JSON.stringify(entries, null, 2)}\n`);
await writeFile(
  new URL('map.json', dir),
  `${JSON.stringify({ projection: 'equirectangular', land, shapes, views })}\n`,
);

console.log(`\n${entries.length} states, ${downloaded} flags downloaded, ${kept} already present`);
const points = Object.values(shapes).reduce(
  (n, s) => n + s.rings.reduce((m, r) => m + r.length / 2, 0), 0);
console.log(`${points.toLocaleString()} shape points, ${land.length} outline rings`);
for (const [name, b] of Object.entries(views).sort()) {
  const n = name === 'All' ? entries.length : groups[name].length;
  console.log(`  ${name.padEnd(10)} ${String(n).padStart(2)} states  lon ${String(Math.round(b[0])).padStart(5)}..${String(Math.round(b[2])).padEnd(5)} lat ${String(Math.round(b[1])).padStart(3)}..${Math.round(b[3])}`);
}
