/**
 * The globe: a canvas showing the Earth from space, drawn a pixel at a time.
 *
 * Drawing it per pixel rather than as vector paths is what keeps this simple.
 * Every pixel inside the disc is turned back into a coordinate and looked up in
 * a flat texture of the world; pixels outside it are sky. There is no polygon to
 * clip at the horizon and no seam anywhere, because a sphere has no edges — the
 * whole class of wrapping bug that a flat map invites cannot arise here.
 *
 * The texture is drawn once, flat, where wrapping is trivial: each ring is
 * painted three times, a turn to the left, in place, and a turn to the right, so
 * whatever crosses an edge is covered by a neighbouring copy.
 */

import { createGlobe, viewToGlobe } from '../lib/globe.js';

/** Texture detail. Finer than the globe can show, so the limb stays clean. */
const TEXTURE_WIDTH = 2048;

const colourOf = (element, name, fallback) =>
  getComputedStyle(element).getPropertyValue(name).trim() || fallback;

export function createGlobeMap({ map, view, onPick, label, rotatable }) {
  const { centre, zoom } = viewToGlobe(view);

  /**
   * The slice of the world the texture covers.
   *
   * Zoomed out it is the whole world, which is what lets the globe spin without
   * ever redrawing it. Zoomed into a continent it is just that continent, so the
   * same pixel budget buys far more detail where it is being looked at.
   */
  const window_ = zoom > 1.05
    ? (() => {
        const [lonMin, latMin, lonMax, latMax] = view;
        const padLon = (lonMax - lonMin) * 0.35;
        const padLat = (latMax - latMin) * 0.35;
        return [
          lonMin - padLon, Math.max(-90, latMin - padLat),
          lonMax + padLon, Math.min(90, latMax + padLat),
        ];
      })()
    : [-180, -90, 180, 90];

  const [winLonMin, winLatMin, winLonMax, winLatMax] = window_;
  const winLonSpan = winLonMax - winLonMin;
  const winLatSpan = winLatMax - winLatMin;

  const texWidth = TEXTURE_WIDTH;
  const texHeight = Math.max(2, Math.round((texWidth * winLatSpan) / winLonSpan));

  const canvas = document.createElement('canvas');
  canvas.className = 'globe';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', label);

  const texture = document.createElement('canvas');
  texture.width = texWidth;
  texture.height = texHeight;
  const tex = texture.getContext('2d', { willReadFrequently: true });

  let palette = null;
  let texels = null;
  let globe = createGlobe({ centre, zoom }, 600);
  let spin = { lat: centre[0], lon: centre[1] };

  /** Flat texture coordinates for a coordinate, in texture pixels. */
  const toTexture = (lon, lat) => [
    ((lon - winLonMin) / winLonSpan) * texWidth,
    ((winLatMax - lat) / winLatSpan) * texHeight,
  ];

  /** Paint a set of rings into the texture, three times across, then fill. */
  function paint(rings, fill) {
    tex.fillStyle = fill;
    for (const turn of [-360, 0, 360]) {
      tex.beginPath();
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = toTexture(ring[i] + turn, ring[i + 1]);
          if (i === 0) tex.moveTo(x, y);
          else tex.lineTo(x, y);
        }
        tex.closePath();
      }
      tex.fill('evenodd');
    }
  }

  /** Draw the whole texture from scratch, then cache its pixels. */
  function buildTexture() {
    tex.fillStyle = palette.ocean;
    tex.fillRect(0, 0, texWidth, texHeight);
    paint(map.land, palette.land);
    for (const [code, style] of marks) {
      paint(map.shapes[code].rings, palette[style]);
    }
    texels = tex.getImageData(0, 0, texWidth, texHeight).data;
  }

  /** Places coloured into the texture: code to palette entry. */
  const marks = new Map();

  let image = null;
  let pixels = null;

  /** Redraw the globe from the texture, one pixel at a time. */
  function draw() {
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    if (!image || image.width !== size) {
      image = ctx.createImageData(size, size);
      pixels = image.data;
    }

    const radius = globe.radius;
    const centreX = size / 2;
    const centreY = size / 2;
    const [sky, skyG, skyB] = palette.skyRgb;

    for (let py = 0; py < size; py++) {
      const dy = (centreY - py) / radius;
      const dy2 = dy * dy;
      let index = py * size * 4;

      for (let px = 0; px < size; px++, index += 4) {
        const dx = (px - centreX) / radius;
        const rho2 = dx * dx + dy2;

        if (rho2 > 1) {
          pixels[index] = sky;
          pixels[index + 1] = skyG;
          pixels[index + 2] = skyB;
          pixels[index + 3] = 255;
          continue;
        }

        const coordinate = globe.unproject([px, py]);
        if (!coordinate) {
          pixels[index + 3] = 0;
          continue;
        }

        const [lat, lon] = coordinate;
        // Longitude may need a turn to land inside the texture's window.
        let tx = ((lon - winLonMin) / winLonSpan) * texWidth;
        if (tx < 0) tx += (360 / winLonSpan) * texWidth;
        if (tx >= texWidth) tx -= (360 / winLonSpan) * texWidth;
        const ty = ((winLatMax - lat) / winLatSpan) * texHeight;

        if (tx < 0 || tx >= texWidth || ty < 0 || ty >= texHeight) {
          pixels[index] = sky;
          pixels[index + 1] = skyG;
          pixels[index + 2] = skyB;
          pixels[index + 3] = 255;
          continue;
        }

        const t = ((ty | 0) * texWidth + (tx | 0)) * 4;
        pixels[index] = texels[t];
        pixels[index + 1] = texels[t + 1];
        pixels[index + 2] = texels[t + 2];
        pixels[index + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
  }

  /** Match the canvas to its box on screen, then redraw. */
  function resize() {
    const box = canvas.getBoundingClientRect();
    const size = Math.max(200, Math.round(Math.min(box.width, box.height || box.width)));
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
      image = null;
    }
    globe = createGlobe({ centre: [spin.lat, spin.lon], zoom }, size);
    draw();
  }

  let accepting = true;
  let dragging = null;
  let moved = false;

  canvas.addEventListener('pointerdown', (event) => {
    if (!rotatable) return;
    dragging = { x: event.clientX, y: event.clientY, lat: spin.lat, lon: spin.lon };
    moved = false;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragging.x;
    const dy = event.clientY - dragging.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;

    // A drag across the globe's width turns it about half a turn.
    const perPixel = 180 / canvas.width;
    spin = {
      lon: dragging.lon - dx * perPixel,
      lat: Math.max(-85, Math.min(85, dragging.lat + dy * perPixel)),
    };
    globe = createGlobe({ centre: [spin.lat, spin.lon], zoom }, canvas.width);
    draw();
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = null;
    canvas.releasePointerCapture?.(event.pointerId);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('click', (event) => {
    // A drag that turned the globe is not also a guess.
    if (!accepting || moved) return;
    const box = canvas.getBoundingClientRect();
    const scale = canvas.width / box.width;
    const point = [(event.clientX - box.left) * scale, (event.clientY - box.top) * scale];
    const coordinate = globe.unproject(point);
    if (coordinate) onPick({ point, coordinate });
  });

  canvas.addEventListener('keydown', (event) => {
    if (!accepting) return;
    const step = event.shiftKey ? 2 : 10;
    const turns = {
      ArrowLeft: [0, -step], ArrowRight: [0, step],
      ArrowUp: [step, 0], ArrowDown: [-step, 0],
    };

    if (rotatable && turns[event.key]) {
      event.preventDefault();
      spin = {
        lat: Math.max(-85, Math.min(85, spin.lat + turns[event.key][0])),
        lon: spin.lon + turns[event.key][1],
      };
      globe = createGlobe({ centre: [spin.lat, spin.lon], zoom }, canvas.width);
      draw();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // The middle of the globe is what the player is looking at.
      onPick({ point: [canvas.width / 2, canvas.width / 2], coordinate: [spin.lat, spin.lon] });
    }
  });

  const observer = new ResizeObserver(() => resize());

  return {
    element: canvas,
    projection: globe,
    renderedWidth: () => canvas.getBoundingClientRect().width || canvas.width,

    /** Called once the canvas is in the document and has a size. */
    mount() {
      palette = {
        ocean: colourOf(canvas, '--ocean', '#cfe0ea'),
        land: colourOf(canvas, '--land', '#e6e1d3'),
        correct: colourOf(canvas, '--correct', '#1c6b3f'),
        answer: colourOf(canvas, '--wrong', '#8a3c1d'),
        placed: colourOf(canvas, '--correct', '#1c6b3f'),
        skyRgb: [0, 0, 0],
      };
      buildTexture();
      resize();
      observer.observe(canvas);
    },

    destroy() {
      observer.disconnect();
    },

    setAccepting(value) {
      accepting = value;
      canvas.classList.toggle('is-locked', !value);
    },

    /** Turn the globe so a coordinate is in the middle. */
    lookAt([lat, lon]) {
      spin = { lat: Math.max(-85, Math.min(85, lat)), lon };
      globe = createGlobe({ centre: [spin.lat, spin.lon], zoom }, canvas.width);
      draw();
    },

    clear() {
      for (const [code, style] of [...marks]) {
        if (style !== 'placed') marks.delete(code);
      }
      buildTexture();
      draw();
    },

    reset() {
      marks.clear();
      buildTexture();
      draw();
    },

    reveal(code, { correct }) {
      marks.set(code, correct ? 'correct' : 'answer');
      buildTexture();
      draw();
    },

    place(code) {
      marks.set(code, 'placed');
      buildTexture();
      draw();
    },
  };
}
