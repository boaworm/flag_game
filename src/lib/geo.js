/**
 * The geometry behind the map modes.
 *
 * Shapes are stored in longitude and latitude, not in screen units, because the
 * same shapes are drawn at world scale and zoomed into a single continent. A
 * projection is built per view, and it is the only thing that knows about pixels.
 *
 * The projection is equidistant cylindrical: longitude and latitude both map
 * linearly to x and y, with longitude scaled by the cosine of the view's middle
 * latitude so a continent is not stretched sideways. Being linear in both axes
 * is what makes a click invert back to a coordinate exactly, which mode 4 needs
 * in order to say how far away a guess landed.
 */

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE = 111.32;
const toRadians = (deg) => (deg * Math.PI) / 180;

/**
 * Build a projection for a view.
 *
 * A view is [lonMin, latMin, lonMax, latMax]; its longitudes may run past 180 so
 * that a region crossing the antimeridian stays in one piece — Oceania runs from
 * 110° east to 200°, which is 160° west. Points west of the view's start are
 * shifted by a turn of the globe to match.
 */
export function createProjection(view, width) {
  const [lonMin, latMin, lonMax, latMax] = view;
  const lonSpan = lonMax - lonMin;
  const latSpan = latMax - latMin;

  // Scaling longitude by the cosine of the middle latitude keeps a region's
  // proportions close to true. Without it, Europe comes out twice as wide as it
  // should be.
  const lonScale = Math.cos(toRadians((latMin + latMax) / 2));
  const scale = width / (lonSpan * lonScale);
  const height = latSpan * scale;

  const lonMid = (lonMin + lonMax) / 2;

  /**
   * Longitude in the view's frame: whichever of lon, lon±360 sits closest to the
   * middle of the view.
   *
   * Nearest matters. Normalising into a turn that starts at the view's western
   * edge looks equivalent and is not: an island a degree west of that edge gets
   * flung a full turn east, and the line drawn back to it crosses the entire map.
   * That is exactly what a small Aleutian island did to the United States map.
   * Choosing the nearest representation leaves it just off the western edge,
   * where the viewBox quietly clips it.
   */
  const inFrame = (lon) => {
    let value = lon;
    while (value - lonMid > 180) value -= 360;
    while (lonMid - value > 180) value += 360;
    return value;
  };

  return {
    view,
    width,
    height,
    /** Kilometres covered by one unit of the projected canvas. */
    kmPerUnit: KM_PER_DEGREE / scale,

    project([lat, lon]) {
      return [(inFrame(lon) - lonMin) * lonScale * scale, (latMax - lat) * scale];
    },

    unproject([x, y]) {
      const lon = lonMin + x / (lonScale * scale);
      return [latMax - y / scale, lon > 180 ? lon - 360 : lon];
    },
  };
}

/** Great-circle distance between two [lat, lon] points, in kilometres. */
export function haversineKm([lat1, lon1], [lat2, lon2]) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Put a longitude in the same frame as a shape.
 *
 * Shapes that straddle the antimeridian are stored with longitudes past 180, so
 * a click at -179 has to be read as 181 before it can be compared with them.
 */
export function alignLon(lon, bounds) {
  if (bounds[2] > 180 && lon < bounds[0]) return lon + 360;
  if (bounds[0] < -180 && lon > bounds[2]) return lon - 360;
  return lon;
}

/**
 * Is a coordinate inside a shape?
 *
 * Crossing count over every ring at once, which handles holes for free: a point
 * in Lesotho crosses South Africa's outer ring and its inner one, an even
 * number, and so counts as outside.
 */
export function isInside([lat, lon], rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const latI = ring[i + 1];
      const latJ = ring[j + 1];
      if (latI > lat !== latJ > lat) {
        const crossing = ring[j] + ((lat - latJ) / (latI - latJ)) * (ring[i] - ring[j]);
        if (lon < crossing) inside = !inside;
      }
    }
  }
  return inside;
}

/** Where on segment ab the point p is closest, as a fraction along it. */
function closestFraction(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return 0;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.max(0, Math.min(1, t));
}

/**
 * The nearest point on a shape's outline to a coordinate, as [lat, lon].
 *
 * Measured with longitude squeezed by the cosine of the latitude, so "nearest"
 * means nearest on the ground rather than nearest in degrees. Without it, a
 * point south of Norway would be judged closer to Siberia than to Oslo.
 */
export function nearestPointOnShape([lat, lon], rings) {
  const lonScale = Math.cos(toRadians(lat));
  const flatten = ([ringLon, ringLat]) => [(ringLon - lon) * lonScale, ringLat - lat];

  let best = null;
  let bestDistanceSq = Infinity;

  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      const a = [ring[i], ring[i + 1]];
      const b = [ring[j], ring[j + 1]];
      const t = closestFraction([0, 0], flatten(a), flatten(b));
      const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const flat = flatten(point);
      const distanceSq = flat[0] ** 2 + flat[1] ** 2;

      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = [point[1], point[0]];
      }
    }
  }

  return best;
}

/** How far a coordinate is from a shape, in kilometres. Zero means inside it. */
export function missDistanceKm([lat, lon], shape) {
  const aligned = [lat, alignLon(lon, shape.bounds)];
  if (isInside(aligned, shape.rings)) return 0;
  const nearest = nearestPointOnShape(aligned, shape.rings);
  return nearest ? haversineKm(aligned, nearest) : Infinity;
}

/**
 * The smallest a place may be on screen and still be a fair thing to click.
 *
 * Twelve pixels of radius, about a fingertip's worth of aim.
 */
export const MIN_TARGET_PX = 12;

/**
 * How much slack a place gets around its outline, in kilometres.
 *
 * Malta is 27 km across. On a world map drawn 900 px wide, one pixel is about
 * 45 km, so Malta is a third of a pixel — not merely hard to hit but impossible.
 * Zooming into a continent mostly fixes this, and the slack shrinks to nothing
 * as it does, which is why this is measured against what is actually on screen
 * rather than set as a fixed distance.
 *
 * It also means a smaller screen is not a harder game, which is the point of the
 * rule in CLAUDE.md, while a fixed distance would have left the microstates
 * unplayable at world scale.
 */
export function toleranceKm(shape, projection, renderedWidthPx) {
  const kmPerPixel = (projection.kmPerUnit * projection.width) / renderedWidthPx;
  const [lonMin, latMin, lonMax, latMax] = shape.bounds;
  const radiusKm =
    (Math.max(
      (lonMax - lonMin) * Math.cos(toRadians((latMin + latMax) / 2)),
      latMax - latMin,
    ) *
      KM_PER_DEGREE) /
    2;
  return Math.max(0, MIN_TARGET_PX * kmPerPixel - radiusKm);
}

/** Did a guess find the place, allowing it its minimum size on screen? */
export function isHit([lat, lon], shape, projection, renderedWidthPx) {
  const coordinate = [lat, alignLon(lon, shape.bounds)];
  if (isInside(coordinate, shape.rings)) return true;
  const slack = toleranceKm(shape, projection, renderedWidthPx);
  return slack > 0 && missDistanceKm(coordinate, shape) <= slack;
}

/**
 * A distance a child can read. Precision the guess itself does not have is false
 * precision, so this rounds hard, and harder as the distance grows.
 */
export function describeDistance(km) {
  if (km < 20) return `${Math.max(1, Math.round(km))} km`;
  if (km < 500) return `${Math.round(km / 10) * 10} km`;
  if (km < 2000) return `${Math.round(km / 50) * 50} km`;
  return `${Math.round(km / 100) * 100} km`;
}
