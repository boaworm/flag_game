/**
 * Shared geometry helpers for the build tools. Dev-only — nothing here ships.
 *
 * Geometry is kept in longitude/latitude all the way through and is never
 * projected at build time. Projecting here would bake in one canvas size, and
 * the game needs to draw the same shapes at world scale and zoomed into a single
 * continent. The runtime projection is two multiplications per point, so there
 * is nothing to gain by pre-computing it.
 */

/** Natural Earth uses -99 for "no code"; the EH variants fill in most of them. */
export function isoOf(properties, keys = ['ISO_A2_EH', 'ISO_A2', 'ADM0_ISO']) {
  for (const key of keys) {
    const value = properties[key];
    if (value && value !== '-99') return value.toLowerCase();
  }
  return null;
}

/** Every ring of a Polygon or MultiPolygon, as arrays of [lon, lat]. */
export function ringsOf(geometry) {
  if (!geometry) return [];
  const polygons =
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  return polygons.flat();
}

/** Twice the signed area of a ring, in square degrees. For comparing sizes only. */
export function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/** Squared perpendicular distance from p to segment ab. */
function segmentDistanceSq(p, a, b) {
  let [x, y] = a;
  const dx = b[0] - x;
  const dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) [x, y] = [x + dx * t, y + dy * t];
  }
  return (p[0] - x) ** 2 + (p[1] - y) ** 2;
}

/** Ramer-Douglas-Peucker, iterative so a long coastline cannot blow the stack. */
export function simplify(points, tolerance) {
  if (points.length <= 4) return points;

  const toleranceSq = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let furthest = -1;
    let worst = toleranceSq;

    for (let i = first + 1; i < last; i++) {
      const d = segmentDistanceSq(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        furthest = i;
      }
    }

    if (furthest !== -1) {
      keep[furthest] = 1;
      stack.push([first, furthest], [furthest, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/**
 * Turn a feature's geometry into the game's ring format: flat [lon, lat, …]
 * arrays, simplified and rounded.
 *
 * A place always keeps its largest ring no matter how small it is. Monaco and
 * Nauru are a couple of kilometres across, and simplifying them out of existence
 * leaves a place the game can ask about but cannot draw or score.
 */
export function prepareRings(geometry, { tolerance, precision = 4, minArea = 0 }) {
  /**
   * Keep a ring in one piece across the antimeridian.
   *
   * Alaska's Aleutians, Fiji and Kiribati each have rings holding points at both
   * +179 and -179. Drawn as they come, such a ring sweeps a straight line right
   * across the map. Shifting the western half past 180 makes the ring contiguous
   * — its longitudes then run past 180, which the projection understands.
   */
  const unwrap = (ring) => {
    // A ring crosses the antimeridian when consecutive points jump most of the
    // way around the globe — never merely because it is wide. Eurasia spans over
    // 200° without crossing anything, and shifting it would be the very bug this
    // guards against.
    let crosses = false;
    for (let i = 1; i < ring.length && !crosses; i++) {
      if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) crosses = true;
    }
    if (!crosses) return ring;
    return ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
  };

  const rings = ringsOf(geometry)
    .map((ring) => simplify(unwrap(ring), tolerance))
    .filter((ring) => ring.length >= 4)
    .sort((a, b) => ringArea(b) - ringArea(a));

  if (!rings.length) return [];

  const kept = rings.filter((ring, i) => i === 0 || ringArea(ring) >= minArea);
  const round = (n) => Number(n.toFixed(precision));
  return kept.map((ring) => ring.flatMap(([lon, lat]) => [round(lon), round(lat)]));
}

/** Bounding box [lonMin, latMin, lonMax, latMax] over flat rings. */
export function boundsOf(rings) {
  let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] < lonMin) lonMin = ring[i];
      if (ring[i] > lonMax) lonMax = ring[i];
      if (ring[i + 1] < latMin) latMin = ring[i + 1];
      if (ring[i + 1] > latMax) latMax = ring[i + 1];
    }
  }
  return [lonMin, latMin, lonMax, latMax].map((n) => Number(n.toFixed(4)));
}

/**
 * Fetch a Natural Earth layer as GeoJSON, cached under .cache/.
 *
 * The 10m layers run to tens of megabytes and these tools get run repeatedly
 * while tuning. The cache directory is git-ignored; delete it to force a refresh.
 */
export async function naturalEarth(name) {
  const { mkdir, readFile, writeFile } = await import('node:fs/promises');
  const dir = new URL('../../.cache/', import.meta.url);
  const file = new URL(`${name}.geojson`, dir);

  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // Not cached yet.
  }

  const url =
    `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${name}.geojson`;
  console.log(`  downloading ${name}…`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const text = await response.text();

  await mkdir(dir, { recursive: true });
  await writeFile(file, text);
  return JSON.parse(text);
}

/**
 * A point that is genuinely inside a shape, for pointing at it.
 *
 * A dataset's own coordinates for a country are often its bounding-box centre,
 * which for an archipelago is open water: mledoze puts Fiji in the sea between
 * its islands and Kiribati in the empty Pacific. Pointing there when teaching
 * where a country is would be worse than useless.
 *
 * So: scan the largest ring's box, keep the points that fall inside it, and
 * choose the one furthest from any edge — the most "middle of the land" spot.
 */
export function labelPoint(rings) {
  const ring = rings[0];
  let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    lonMin = Math.min(lonMin, ring[i]); lonMax = Math.max(lonMax, ring[i]);
    latMin = Math.min(latMin, ring[i + 1]); latMax = Math.max(latMax, ring[i + 1]);
  }

  const inside = ([lon, lat]) => {
    let odd = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      if (ring[i + 1] > lat !== ring[j + 1] > lat) {
        const x = ring[j] + ((lat - ring[j + 1]) / (ring[i + 1] - ring[j + 1])) * (ring[i] - ring[j]);
        if (lon < x) odd = !odd;
      }
    }
    return odd;
  };

  const lonScale = Math.cos(((latMin + latMax) / 2 * Math.PI) / 180);
  const clearance = ([lon, lat]) => {
    let best = Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      const dx = (ring[i] - lon) * lonScale;
      const dy = ring[i + 1] - lat;
      best = Math.min(best, dx * dx + dy * dy);
    }
    return best;
  };

  const STEPS = 48;
  let best = null;
  let bestClearance = -1;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const candidate = [
        lonMin + ((lonMax - lonMin) * i) / STEPS,
        latMin + ((latMax - latMin) * j) / STEPS,
      ];
      if (!inside(candidate)) continue;
      const c = clearance(candidate);
      if (c > bestClearance) { bestClearance = c; best = candidate; }
    }
  }

  // A shape thinner than the scan grid falls back to a vertex on its own outline.
  return best ? [best[1], best[0]] : [ring[1], ring[0]];
}
