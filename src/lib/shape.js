/**
 * Laying a single shape out on its own, for the modes that show a place's
 * outline rather than its position.
 *
 * Pure geometry — it returns paths and circles, and knows nothing about the DOM.
 */

const toRadians = (deg) => (deg * Math.PI) / 180;

/**
 * Fit a shape into a square of `size`.
 *
 * Framed to the shape's core rather than its full extent: Norway owns an island
 * near Antarctica, and framing to that leaves the mainland a speck in an empty
 * card. Anything outside the frame is clipped by the viewBox.
 *
 * Islands smaller than `minIsland` come back as circles instead of paths. Drawn
 * faithfully they would be less than a pixel — the Maldives is twelve hundred
 * islands of about a kilometre each, spread over eight hundred — and the card
 * would look empty. An atlas draws them as dots for exactly this reason, and a
 * chain of dots is what the Maldives actually looks like.
 */
export function layoutShape(shape, size, { padding = 0.08, minIsland = 5 } = {}) {
  const [lonMin, latMin, lonMax, latMax] = shape.core ?? shape.bounds;
  const lonScale = Math.cos(toRadians((latMin + latMax) / 2));

  const width = Math.max((lonMax - lonMin) * lonScale, 1e-6);
  const height = Math.max(latMax - latMin, 1e-6);
  const inner = size * (1 - padding * 2);
  const scale = Math.min(inner / width, inner / height);

  const offsetX = (size - width * scale) / 2;
  const offsetY = (size - height * scale) / 2;
  const project = (lon, lat) => [
    offsetX + (lon - lonMin) * lonScale * scale,
    offsetY + (latMax - lat) * scale,
  ];

  const paths = [];
  const dots = [];

  for (const ring of shape.rings) {
    let d = '';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = project(ring[i], ring[i + 1]);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }

    // Entirely outside the frame — an outlying territory the framing excluded.
    if (x1 < 0 || y1 < 0 || x0 > size || y0 > size) continue;

    if (Math.max(x1 - x0, y1 - y0) < minIsland) {
      dots.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: minIsland / 2 });
    } else {
      paths.push(`${d}Z`);
    }
  }

  return { size, paths, dots };
}
