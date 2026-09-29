/**
 * Drawing a place's outline on its own, for the modes that ask about shape
 * rather than position. The layout itself is in lib/shape.js.
 */

import { layoutShape } from '../lib/shape.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An SVG of a place's shape, fitted to a square box.
 *
 * `label` is what a screen reader hears. It deliberately does not name the place
 * — in these modes that is the answer.
 */
export function shapeSvg(shape, { size = 240, label = 'A shape to identify' } = {}) {
  const { paths, dots } = layoutShape(shape, size);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'shape');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);

  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'shape-body');
    svg.append(path);
  }

  // Islands too small to draw faithfully, shown as dots. See lib/shape.js.
  for (const { cx, cy, r } of dots) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', cx.toFixed(1));
    circle.setAttribute('cy', cy.toFixed(1));
    circle.setAttribute('r', r);
    circle.setAttribute('class', 'shape-body');
    svg.append(circle);
  }

  return svg;
}
