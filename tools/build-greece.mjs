#!/usr/bin/env node
/**
 * Builds the "greece" set: the places of ancient Greece, and where they are.
 *
 *   node tools/build-greece.mjs
 *
 * Dev-only. Writes data/sets/greece/.
 *
 * This set is not like the other two, and the differences are the point:
 *
 *   - There are no flags. A city state's banner is not a settled thing and
 *     inventing one would be teaching something false, so the set declares it
 *     has none and the modes that need flags do not offer it.
 *   - Most of these places are points, not areas. Knossos is a palace. So a
 *     place that is not an island gets a small circle standing in for it, which
 *     the game draws as a pin, and the aim ring is what makes it clickable.
 *   - An island, though, has a real outline, taken from the coastline itself:
 *     the smallest land polygon containing its coordinate. Crete is 260 km of
 *     coast worth seeing, not a dot. Which places are islands is stated in the
 *     table and not inferred from the geometry — Knossos and Heraklion are both
 *     inside Crete's polygon, and inferring gave each of them the whole island.
 *
 * Sources:
 *   - ne_10m_land   coastlines, with no borders in them, so the base map cannot
 *                   give an answer away
 *   - the table below, for where each place is
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { boundsOf, coreBounds, labelPoint, naturalEarth, prepareRings, ringArea, ringsOf }
  from './lib/geojson.mjs';

/**
 * The box the map covers: the Greek world and enough of its neighbours to place
 * it — Crete and Rhodes to the south, the coast of Asia Minor to the east, and
 * far enough north for Macedonia, southern Bulgaria and southern Albania.
 */
const REGION = [18.5, 34.0, 30.0, 42.5];

/**
 * Coastline is kept well beyond the region, so zooming out shows the sea in the
 * context of Europe and North Africa rather than stopping at a cliff edge. How
 * far out the player may zoom is limited to match.
 */
const COAST = [2.0, 26.0, 46.0, 54.0];

/** A regional map can afford far finer detail than a world one. */
const TOLERANCE = 0.004;

/** The circle that stands in for a place with no outline of its own. */
const SITE_RADIUS_KM = 5;

/** Land bigger than this is a mainland, not an island someone can be asked for. */
const MAINLAND_AREA = 50;

/** Marks a place in the table below as an island with an outline of its own. */
const ISLAND = 'island';

const KM_PER_DEGREE = 111.32;
const RAD = Math.PI / 180;

/**
 * Where each place is, and what else it is called.
 *
 * Reference data, kept in the builder rather than in the game, where
 * data/sets/greece/entries.json remains the single source of truth. Coordinates
 * are the modern site; for an ancient one that is the excavation rather than
 * wherever the city walls once ran.
 */
const PLACES = [
  // Attica and the centre
  ['athens', 'Athens', 'Attica and Central Greece', 37.976, 23.728, ['Athina', 'Athenai']],
  ['piraeus', 'Piraeus', 'Attica and Central Greece', 37.943, 23.647, ['Pireas', 'Peiraeus', 'Pireaus']],
  ['delphi', 'Delphi', 'Attica and Central Greece', 38.482, 22.501, ['Delfi', 'Delphoi']],

  // The Peloponnese
  ['corinth', 'Corinth', 'The Peloponnese', 37.906, 22.879, ['Korinthos', 'Ancient Corinth']],
  ['olympia', 'Olympia', 'The Peloponnese', 37.638, 21.630, ['Ancient Olympia', 'Olympia Elis']],
  ['patras', 'Patras', 'The Peloponnese', 38.246, 21.735, ['Patra', 'Patrai']],

  // Thessaly and the north
  ['larissa', 'Larissa', 'Thessaly and the North', 39.639, 22.418, ['Larisa']],
  ['volos', 'Volos', 'Thessaly and the North', 39.362, 22.942, ['Volo', 'Iolcos']],
  ['thessaloniki', 'Thessaloniki', 'Thessaly and the North', 40.640, 22.944, ['Salonica', 'Thessalonica', 'Saloniki']],

  // Islands, which have outlines of their own
  ['corfu', 'Corfu', 'The Islands', 39.620, 19.922, ['Kerkyra', 'Korkyra'], ISLAND],
  ['zakynthos', 'Zante', 'The Islands', 37.788, 20.899, ['Zakynthos', 'Zakinthos'], ISLAND],
  ['lesbos', 'Lesbos', 'The Islands', 39.220, 26.280, ['Lesvos', 'Mytilene', 'Mitilini'], ISLAND],
  ['chios', 'Chios', 'The Islands', 38.370, 26.040, ['Khios', 'Hios'], ISLAND],

  // Crete
  ['crete', 'Crete', 'Crete', 35.240, 24.810, ['Kriti', 'Creta'], ISLAND],
  ['knossos', 'Knossos', 'Crete', 35.298, 25.163, ['Cnossus', 'Knossos Palace']],
  ['heraklion', 'Heraklion', 'Crete', 35.339, 25.133, ['Iraklion', 'Irakleio', 'Candia']],
];

console.log('Reading Natural Earth…');
const landLayer = await naturalEarth('ne_10m_land');
const allRings = landLayer.features.flatMap((feature) => ringsOf(feature.geometry));
console.log(`  ${allRings.length} land rings worldwide`);

/** The lon/lat box a ring of [lon, lat] pairs covers. */
function boxOf(ring) {
  let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
  }
  return [lonMin, latMin, lonMax, latMax];
}

const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Is a coordinate inside a ring? Crossing count, as everywhere else. */
function inside([lon, lat], ring) {
  let odd = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (ring[i][1] > lat !== ring[j][1] > lat) {
      const x =
        ring[j][0] + ((lat - ring[j][1]) / (ring[i][1] - ring[j][1])) * (ring[i][0] - ring[j][0]);
      if (lon < x) odd = !odd;
    }
  }
  return odd;
}

/**
 * Clip a ring to a box, one edge at a time — Sutherland and Hodgman's method.
 *
 * Without this the base map carries the whole of Eurasia, 81,512 points of it,
 * to draw a corner of the Aegean. The cut edges run along the box, which is
 * exactly where the coastline stops being drawn anyway.
 */
function clipToBox(ring, [lonMin, latMin, lonMax, latMax]) {
  const edges = [
    [(p) => p[0] >= lonMin, (a, b) => [lonMin, a[1] + ((b[1] - a[1]) * (lonMin - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= lonMax, (a, b) => [lonMax, a[1] + ((b[1] - a[1]) * (lonMax - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= latMin, (a, b) => [a[0] + ((b[0] - a[0]) * (latMin - a[1])) / (b[1] - a[1]), latMin]],
    [(p) => p[1] <= latMax, (a, b) => [a[0] + ((b[0] - a[0]) * (latMax - a[1])) / (b[1] - a[1]), latMax]],
  ];

  let output = ring;
  for (const [keep, cross] of edges) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentIn = keep(current);
      const previousIn = keep(previous);
      if (currentIn) {
        if (!previousIn) output.push(cross(previous, current));
        output.push(current);
      } else if (previousIn) {
        output.push(cross(previous, current));
      }
    }
    if (!output.length) return [];
  }
  return output;
}

/** A ring of points a given distance around a coordinate, as a stand-in shape. */
function circleAround(lat, lon, km, steps = 32) {
  const dLat = km / KM_PER_DEGREE;
  const dLon = km / (KM_PER_DEGREE * Math.max(0.05, Math.cos(lat * RAD)));
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return ring;
}

const round = (n) => Number(n.toFixed(6));
const flatten = (ring) => ring.flatMap(([lon, lat]) => [round(lon), round(lat)]);

// The base map: every coast in range, clipped to the box and simplified.
const land = [];
for (const ring of allRings) {
  if (!overlaps(boxOf(ring), COAST)) continue;
  const clipped = clipToBox(ring, COAST);
  if (clipped.length < 4) continue;
  land.push(
    ...prepareRings(
      { type: 'Polygon', coordinates: [clipped] },
      { tolerance: TOLERANCE, minAreaRatio: 0 },
    ),
  );
}
if (!land.length) throw new Error('No coastline in range; the land layer changed.');

/**
 * The smallest land polygon a coordinate falls inside, when that polygon is
 * small enough to be an island rather than a continent.
 */
function islandAt(lat, lon) {
  const candidates = allRings.filter(
    (ring) => inside([lon, lat], ring) && ringArea(ring) < MAINLAND_AREA,
  );
  if (!candidates.length) return null;
  return candidates.sort((a, b) => ringArea(a) - ringArea(b))[0];
}

const shapes = {};
const entries = [];
let islands = 0;
let sites = 0;

for (const [code, name, group, lat, lon, alternatives, kind] of PLACES) {
  const island = kind === ISLAND ? islandAt(lat, lon) : null;
  if (kind === ISLAND && !island) {
    throw new Error(`${name} is marked an island but sits on no island; the land layer changed.`);
  }

  const rings = island
    ? prepareRings({ type: 'Polygon', coordinates: [island] }, { tolerance: TOLERANCE })
    : [flatten(circleAround(lat, lon, SITE_RADIUS_KM))];

  if (!rings.length) throw new Error(`${name} has no shape.`);

  // An island points at its own middle, which is inside it; a site points at
  // itself, because the circle is only there to be clicked.
  const point = island ? labelPoint(rings) : [lat, lon];

  shapes[code] = {
    rings,
    bounds: boundsOf(rings),
    core: coreBounds(rings),
    point,
  };

  if (island) islands += 1;
  else sites += 1;

  entries.push({
    code,
    name,
    group,
    coordinates: point,
    acceptedNames: [name, ...alternatives],
  });
}

// Every place must be findable, or the set is not playable.
for (const entry of entries) {
  const shape = shapes[entry.code];
  if (!shape) throw new Error(`${entry.name} has no shape.`);
  const [lonMin, latMin, lonMax, latMax] = shape.bounds;
  if (lonMin < REGION[0] || lonMax > REGION[2] || latMin < REGION[1] || latMax > REGION[3]) {
    throw new Error(`${entry.name} falls outside the map at ${shape.point}.`);
  }
}
if (entries.length !== PLACES.length) {
  throw new Error(`Expected ${PLACES.length} places, built ${entries.length}.`);
}

entries.sort((a, b) => a.name.localeCompare(b.name));

const groups = {};
for (const entry of entries) (groups[entry.group] ??= []).push(entry);

/**
 * One view: the whole Greek world.
 *
 * The set is not divided up in play — sixteen places fit on one map, and the
 * player can zoom for a closer look at any of them — so there is no per-region
 * view to write. Each place still records the region it belongs to.
 */
const views = { All: REGION };

/**
 * How far out the player may zoom, given the coastline stops at COAST.
 *
 * The globe shows a cap of the sphere, and the cap grows as the zoom falls. Let
 * it grow past the coastline we hold and the sea simply ends, so the limit is
 * the zoom at which the cap still fits inside the data.
 */
const coastMid = (COAST[1] + COAST[3]) / 2;
const coastSpan = Math.min(
  (COAST[2] - COAST[0]) * Math.cos(coastMid * RAD),
  COAST[3] - COAST[1],
);
const minZoom = Number((1 / Math.sin((coastSpan / 2) * RAD)).toFixed(2));

const dir = new URL('../data/sets/greece/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('entries.json', dir), `${JSON.stringify(entries, null, 2)}\n`);
await writeFile(
  new URL('map.json', dir),
  `${JSON.stringify({ projection: 'equirectangular', land, shapes, views, minZoom })}\n`,
);

const points = Object.values(shapes).reduce(
  (n, s) => n + s.rings.reduce((m, r) => m + r.length / 2, 0), 0);
console.log(`\n${entries.length} places: ${islands} islands with outlines, ${sites} sites as points`);
console.log(`coast covers ${coastSpan.toFixed(0)}\u00b0, so the map does not zoom out past ${minZoom}x`);
console.log(`${points.toLocaleString()} shape points, ${land.length} coast rings, ` +
  `${land.reduce((n, r) => n + r.length / 2, 0).toLocaleString()} points`);
console.log(`map covers lon ${REGION[0]}..${REGION[2]}, lat ${REGION[1]}..${REGION[3]}`);
for (const [name, members] of Object.entries(groups)) {
  console.log(`  ${name.padEnd(26)} ${String(members.length).padStart(2)} places`);
}
