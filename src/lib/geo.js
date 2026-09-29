/**
 * The geometry behind the map modes.
 *
 * Shapes are stored in longitude and latitude, not in screen units, because the
 * same shapes are drawn at world scale and zoomed into a single continent, and
 * because everything here — what was hit, how far a miss was, how much slack a
 * small place gets — is then true of any projection. The projection itself lives
 * in lib/globe.js and is the only thing that knows about pixels.
 */

const EARTH_RADIUS_KM = 6371;
const toRadians = (deg) => (deg * Math.PI) / 180;

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
 * How wide the ring the player aims with is, measured on the ground.
 *
 * A guess is a circle, not a point, and this is that circle. It is drawn where
 * the player clicked and a place is found if any of it falls inside the ring, so
 * the rule is one you can see: if the ring touches the place, that counts.
 *
 * The same distance at every zoom. How close you have to click is a property of
 * the question, not of how far in the player happens to have scrolled — a ring
 * that tightened as you zoomed would mean zooming in made the game harder and
 * zooming out made it easier, which is backwards. So the ring keeps its grip on
 * the ground and changes size on screen instead, growing as you close in.
 */
export const AIM_REACH_KM = 300;

/** How far the aim ring reaches from the guess, in kilometres. */
export const aimReachKm = () => AIM_REACH_KM / 2;

/**
 * Walk a circle of fixed ground radius around a coordinate.
 *
 * What the ring is drawn from, so the circle on screen is the circle the guess
 * is judged against rather than an approximation of it. A circle on a sphere is
 * not a circle on the canvas — the globe turns it into an ellipse away from the
 * middle, and squashes it flat at the limb — so it is walked as real points and
 * projected one by one.
 */
export function aimRingPoints([lat, lon], steps = 72) {
  const angular = aimReachKm() / EARTH_RADIUS_KM;
  const sinD = Math.sin(angular);
  const cosD = Math.cos(angular);
  const latR = toRadians(lat);
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);

  const points = [];
  for (let i = 0; i < steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(sinLat * cosD + cosLat * sinD * Math.cos(bearing));
    const lon2 =
      toRadians(lon) +
      Math.atan2(Math.sin(bearing) * sinD * cosLat, cosD - sinLat * Math.sin(lat2));
    points.push([(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI]);
  }
  return points;
}

/**
 * Did the guess find the place?
 *
 * True when the ring overlaps the place anywhere — which for anything bigger
 * than the ring means clicking inside it, and for anything smaller means
 * catching it within a ring's reach.
 */
export function isHit([lat, lon], shape) {
  const coordinate = [lat, alignLon(lon, shape.bounds)];
  if (isInside(coordinate, shape.rings)) return true;
  return missDistanceKm(coordinate, shape) <= aimReachKm();
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
