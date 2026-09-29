/**
 * The clickable map.
 *
 * Draws an outline with no internal borders — continent coastlines for the world
 * set, the national outline for the US one — so the map itself never gives an
 * answer away. Shapes arrive in longitude and latitude and are projected here,
 * to whichever view the player has chosen, so picking a continent zooms in.
 */

import { createProjection } from '../lib/geo.js';
import { el } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

export function createMap({ map, view, onPick, label }) {
  const projection = createProjection(view, 2000);

  /** A flat [lon, lat, …] ring as a projected SVG path. */
  const ringPath = (ring) => {
    let d = '';
    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = projection.project([ring[i + 1], ring[i]]);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return `${d}Z`;
  };

  const shapePath = (rings) => rings.map(ringPath).join(' ');

  const svg = svgEl('svg', {
    viewBox: `0 0 ${projection.width} ${projection.height.toFixed(1)}`,
    class: 'world',
    role: 'application',
    tabindex: '0',
    'aria-label': label,
  });

  svg.append(
    svgEl('rect', {
      x: 0, y: 0, width: projection.width, height: projection.height, class: 'ocean',
    }),
    svgEl('path', { d: shapePath(map.land), class: 'land' }),
  );

  // Two layers: answers that stay on the board, and the working-out for the
  // question in hand. Modes that build up a map keep the first and clear the
  // second between questions.
  const placed = svgEl('g', { class: 'placed' });
  const overlay = svgEl('g', { class: 'overlay' });
  svg.append(placed, overlay);

  /** A crosshair, so the map can be played from the keyboard. */
  let cursor = [projection.width / 2, projection.height / 2];
  const crosshair = svgEl('g', { class: 'crosshair', hidden: 'hidden' });
  const arm = projection.width / 90;
  crosshair.append(
    svgEl('circle', { r: arm * 0.7, cx: 0, cy: 0, class: 'crosshair-ring' }),
    svgEl('line', { x1: -arm, y1: 0, x2: arm, y2: 0, class: 'crosshair-arm' }),
    svgEl('line', { x1: 0, y1: -arm, x2: 0, y2: arm, class: 'crosshair-arm' }),
  );
  svg.append(crosshair);

  const placeCrosshair = () => {
    crosshair.setAttribute('transform', `translate(${cursor[0]} ${cursor[1]})`);
    crosshair.removeAttribute('hidden');
  };

  let accepting = true;

  /** Screen coordinates to map units, via the SVG's own transform. */
  function toMapPoint(event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const { x, y } = point.matrixTransform(ctm.inverse());
    return [x, y];
  }

  const pick = (point) => {
    cursor = point;
    onPick({ point, coordinate: projection.unproject(point) });
  };

  svg.addEventListener('click', (event) => {
    if (!accepting) return;
    const point = toMapPoint(event);
    if (point) pick(point);
  });

  svg.addEventListener('keydown', (event) => {
    if (!accepting) return;

    const step = (event.shiftKey ? 0.004 : 0.025) * projection.width;
    const moves = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, -step], ArrowDown: [0, step],
    };

    if (moves[event.key]) {
      event.preventDefault();
      cursor = [
        Math.max(0, Math.min(projection.width, cursor[0] + moves[event.key][0])),
        Math.max(0, Math.min(projection.height, cursor[1] + moves[event.key][1])),
      ];
      placeCrosshair();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      placeCrosshair();
      pick([...cursor]);
    }
  });

  return {
    element: svg,
    projection,

    /** The map's rendered width in CSS pixels, which sets the hit tolerance. */
    renderedWidth: () => svg.getBoundingClientRect().width || projection.width,

    setAccepting(value) {
      accepting = value;
      svg.classList.toggle('is-locked', !value);
    },

    /** Clear the working-out, keeping anything already placed. */
    clear() {
      overlay.replaceChildren();
    },

    /** Clear everything, including places already put on the board. */
    reset() {
      overlay.replaceChildren();
      placed.replaceChildren();
    },

    /** Put a place on the board for good, where a correct answer belongs. */
    place(shape) {
      placed.append(
        svgEl('path', { d: shapePath(shape.rings), class: 'country is-placed' }),
      );
      const [lonMin, latMin, lonMax, latMax] = shape.bounds;
      const [x0, y0] = projection.project([latMax, lonMin]);
      const [x1, y1] = projection.project([latMin, lonMax]);
      if (Math.max(x1 - x0, y1 - y0) < projection.width / 70) {
        const [cx, cy] = projection.project(shape.point);
        placed.append(
          svgEl('circle', { cx, cy, r: projection.width / 110, class: 'pin is-placed' }),
        );
      }
    },

    /** Show a place's shape, filled. */
    reveal(shape, { correct }) {
      overlay.append(
        svgEl('path', {
          d: shapePath(shape.rings),
          class: `country ${correct ? 'is-correct' : 'is-answer'}`,
        }),
      );

      // A place smaller than a few pixels needs a marker, or revealing Malta
      // shows nothing at all.
      const [lonMin, latMin, lonMax, latMax] = shape.bounds;
      const [x0, y0] = projection.project([latMax, lonMin]);
      const [x1, y1] = projection.project([latMin, lonMax]);
      if (Math.max(x1 - x0, y1 - y0) < projection.width / 70) {
        const [cx, cy] = projection.project(shape.point);
        overlay.append(
          svgEl('circle', {
            cx, cy, r: projection.width / 110,
            class: `pin ${correct ? 'is-correct' : 'is-answer'}`,
          }),
        );
      }
    },

    /** Mark where the player pointed, and draw the gap to the answer. */
    markMiss(from, coordinate) {
      const [x, y] = projection.project(coordinate);
      overlay.append(
        svgEl('line', {
          x1: from[0], y1: from[1], x2: x, y2: y, class: 'miss-line',
        }),
        svgEl('circle', {
          cx: from[0], cy: from[1], r: projection.width / 190, class: 'miss-dot',
        }),
      );
    },
  };
}

/** A small flag beside the place being asked about. */
export const flagChip = (src) =>
  el('img.chip-flag', { src, alt: '', width: 48, height: 36 });
