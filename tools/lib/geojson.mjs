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
 * Both thresholds here are relative to the shape's own size, and that is the
 * whole point. A fixed simplification tolerance of 2 km is sensible for France
 * and annihilates Monaco, which is 2 km across — it came out as a quadrilateral.
 * A fixed minimum ring area is worse: every island in the Maldives is smaller
 * than 10 km², so an absolute floor deleted the entire country bar one atoll.
 *
 * So each ring is simplified in proportion to itself, and rings are kept in
 * proportion to the largest one. Every place ends up with an outline that is
 * recognisably its own, whatever its size.
 */
export function prepareRings(
  geometry,
  { tolerance, precision = 6, maxRings = 400, minAreaRatio = 1e-4, unwrapShape = false },
) {
  /**
   * Keep a ring in one piece across the antimeridian.
   *
   * A ring crosses it when consecutive points jump most of the way around the
   * globe — never merely because it is wide. Eurasia spans over 200° without
   * crossing anything, and shifting it would be the very bug this guards against.
   */
  const unwrap = (ring) => {
    let crosses = false;
    for (let i = 1; i < ring.length && !crosses; i++) {
      if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) crosses = true;
    }
    if (!crosses) return ring;
    return ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
  };

  /** How far across a ring is, in degrees. */
  const extentOf = (ring) => {
    let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
    for (const [lon, lat] of ring) {
      lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon);
      latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
    }
    return Math.max(lonMax - lonMin, latMax - latMin);
  };

  /**
   * A ring is simplified by a fraction of its own width, never coarser than the
   * set's tolerance and never finer than a few metres.
   */
  const toleranceFor = (ring) =>
    Math.min(tolerance, Math.max(0.00002, extentOf(ring) * 0.002));

  const rings = ringsOf(geometry)
    .map(unwrap)
    .map((ring) => simplify(ring, toleranceFor(ring)))
    .filter((ring) => ring.length >= 4)
    .sort((a, b) => ringArea(b) - ringArea(a));

  if (!rings.length) return [];

  // Keep anything within a wide factor of the biggest ring, so an archipelago
  // keeps its islands while a continent still sheds its specks.
  // A place drops its specks; a base map keeps its islands, because they are the
  // only thing telling a player an ocean is not empty.
  const largest = ringArea(rings[0]);
  const kept = rings
    .filter((ring, i) => i === 0 || ringArea(ring) >= largest * minAreaRatio)
    .slice(0, maxRings);

  const round = (n) => Number(n.toFixed(precision));
  const flat = kept.map((ring) => ring.flatMap(([lon, lat]) => [round(lon), round(lat)]));

  /**
   * Keep the whole shape in one piece, not merely each ring.
   *
   * Fiji, Kiribati and the Aleutians have islands either side of the
   * antimeridian with no single ring crossing it, so per-ring unwrapping leaves
   * them alone and the shape's bounds come out spanning the entire globe. That
   * makes a shape card unreadable and robs a place of its hit tolerance. The
   * renderer places each longitude nearest the view anyway, so shifting the
   * western half past 180 costs nothing and makes the bounds mean something.
   */
  // Only a single place's shape is worth keeping in one piece: its bounds decide
  // hit tolerance and how a shape card is framed. The land layer has no such
  // meaning — its features are scattered collections of rings spanning the whole
  // globe, where "is this narrower once shifted" compares noise and answers
  // wrongly. That is what tore the base map open at the Greenwich meridian.
  if (!unwrapShape) return flat;

  const spanOf = (shift) => {
    let lonMin = Infinity, lonMax = -Infinity;
    for (const ring of flat) {
      for (let i = 0; i < ring.length; i += 2) {
        const value = shift && ring[i] < 0 ? ring[i] + 360 : ring[i];
        lonMin = Math.min(lonMin, value); lonMax = Math.max(lonMax, value);
      }
    }
    return lonMax - lonMin;
  };

  /**
   * Only a shape with land near both edges of the map can straddle the
   * antimeridian at all, so that is asked first.
   *
   * Asking it first is not an optimisation, it is the correctness of the test
   * below. For a shape lying wholly in the western hemisphere the two spans are
   * equal by construction — every longitude moves by the same 360 — but adding
   * 360 to a number near -73 costs precision, so the shifted span came out a
   * hair narrower and the shift fired. That silently threw Maine, Texas and 20
   * other states, along with Brazil, Canada and Iceland, a full turn east, and
   * with them the views computed from their bounds.
   */
  let nearEast = false;
  let nearWest = false;
  for (const ring of flat) {
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] > 100) nearEast = true;
      else if (ring[i] < -100) nearWest = true;
    }
  }
  if (!nearEast || !nearWest) return flat;

  // Even then, shift only when it actually makes the shape narrower. A shape
  // being wide is not evidence that it straddles anything: the Europe-Asia-Africa
  // landmass spans 198° in one piece, and shifting its western half tears it open
  // at the Greenwich meridian — which draws the same line across the map that
  // this is meant to prevent.
  if (spanOf(true) >= spanOf(false)) return flat;

  return flat.map((ring) =>
    ring.map((value, i) => (i % 2 === 0 && value < 0 ? round(value + 360) : value)),
  );
}

/**
 * The box to frame a shape in when drawing it on its own, as opposed to on a map.
 *
 * Not the full bounding box. Norway owns Bouvet Island near Antarctica and France
 * owns Réunion, so a card framed to everything shows a speck of mainland adrift
 * in empty sea. Rings far smaller than the largest are left out of the framing —
 * they are still drawn, they just no longer decide the zoom.
 *
 * An archipelago keeps its whole chain, because its islands are all of a size:
 * no atoll in the Maldives is a rounding error next to the others.
 */
export function coreBounds(rings) {
  const areas = rings.map((ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      sum += (ring[j] - ring[i]) * (ring[j + 1] + ring[i + 1]);
    }
    return Math.abs(sum / 2);
  });

  const largest = Math.max(...areas);
  const core = rings.filter((_, i) => areas[i] >= largest * 0.01);
  return boundsOf(core.length ? core : rings);
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
