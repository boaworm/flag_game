/**
 * Orthographic projection — the Earth as seen from far away.
 *
 * This replaces the flat map, and the reason is not looks. A flat map has to cut
 * the sphere open somewhere, and every shape crossing that cut has to be
 * detected, shifted or split; getting it wrong draws a line across the whole
 * map. A globe has no cut. Nothing wraps, so nothing can wrap wrongly.
 *
 * The far side is simply not drawn, which on a raster is "this pixel is sky"
 * rather than any polygon clipping.
 *
 * Both directions are exact, so a click still inverts to a real coordinate and
 * mode 4 can still say how far away a guess landed.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * A view of the globe: where it is centred, and how much of the disc fills the
 * canvas. `zoom` of 1 shows the whole hemisphere; higher zooms in on the centre.
 */
export function createGlobe({ centre: [centreLat, centreLon], zoom = 1 }, size) {
  const radius = (size / 2) * zoom;
  const cx = size / 2;
  const cy = size / 2;

  const sinLat0 = Math.sin(centreLat * RAD);
  const cosLat0 = Math.cos(centreLat * RAD);

  return {
    size,
    radius,
    centre: [centreLat, centreLon],
    zoom,

    /** Is this coordinate on the near side of the globe? */
    visible([lat, lon]) {
      const dLon = (lon - centreLon) * RAD;
      return (
        sinLat0 * Math.sin(lat * RAD) +
          cosLat0 * Math.cos(lat * RAD) * Math.cos(dLon) >=
        0
      );
    },

    /** Coordinate to canvas position, or null when it is round the back. */
    project([lat, lon]) {
      const latR = lat * RAD;
      const dLon = (lon - centreLon) * RAD;
      const cosC = sinLat0 * Math.sin(latR) + cosLat0 * Math.cos(latR) * Math.cos(dLon);
      if (cosC < 0) return null;
      return [
        cx + radius * Math.cos(latR) * Math.sin(dLon),
        cy - radius * (cosLat0 * Math.sin(latR) - sinLat0 * Math.cos(latR) * Math.cos(dLon)),
      ];
    },

    /** Canvas position to coordinate, or null when it missed the globe. */
    unproject([x, y]) {
      const dx = (x - cx) / radius;
      const dy = (cy - y) / radius;
      const rho = Math.hypot(dx, dy);
      if (rho > 1) return null;

      const c = Math.asin(rho);
      const sinC = Math.sin(c);
      const cosC = Math.cos(c);

      const lat = rho === 0
        ? centreLat
        : Math.asin(cosC * sinLat0 + (dy * sinC * cosLat0) / rho) * DEG;
      const lon =
        centreLon +
        Math.atan2(dx * sinC, rho * cosLat0 * cosC - dy * sinLat0 * sinC) * DEG;

      return [lat, ((lon + 540) % 360) - 180];
    },
  };
}

/** Where to centre the globe for a named area, and how far to zoom in. */
export function viewToGlobe(view) {
  const [lonMin, latMin, lonMax, latMax] = view;
  const centreLat = (latMin + latMax) / 2;
  const centreLon = (lonMin + lonMax) / 2;

  // The widest angle the area subtends; zoom so it fills most of the canvas.
  const spread = Math.max(
    (lonMax - lonMin) * Math.cos(centreLat * RAD),
    latMax - latMin,
  );
  const zoom = Math.max(1, 150 / Math.max(spread, 12));

  return { centre: [centreLat, ((centreLon + 540) % 360) - 180], zoom };
}
