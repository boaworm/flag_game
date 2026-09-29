/**
 * The globe: a canvas showing the Earth from space, drawn a pixel at a time.
 *
 * Drawing it per pixel rather than as vector paths is what keeps this simple.
 * Every pixel inside the disc is turned back into a coordinate and looked up in
 * a flat texture of the world; pixels outside it are sky. There is no polygon to
 * clip at the horizon and no seam anywhere, because a sphere has no edges — the
 * whole class of wrapping bug that a flat map invites cannot arise here.
 *
 * The texture is drawn flat, where wrapping is trivial: each ring is painted
 * three times, a turn to the left, in place, and a turn to the right, so
 * whatever crosses an edge is covered by a neighbouring copy. It holds only the
 * part of the world on screen, and is repainted when the player turns or zooms
 * far enough to need a different part — which is what keeps a close-up sharp.
 *
 * Only filled areas go through the texture. The aim ring, pins and the line to a
 * missed answer are single points, which project straight onto the canvas
 * without any of the clipping a filled shape at the limb would need.
 */

import { createGlobe, viewToGlobe } from '../lib/globe.js';
import { AIM_RADIUS_PX } from '../lib/geo.js';

/** Texture detail. Finer than the globe can show, so the limb stays clean. */
const TEXTURE_WIDTH = 2048;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Below this fraction of the canvas, a place gets a pin or it cannot be seen. */
const PIN_BELOW = 1 / 70;

/** How far in and out the player may zoom, as a multiple of the whole disc. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 60;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const colourOf = (element, name, fallback) =>
  getComputedStyle(element).getPropertyValue(name).trim() || fallback;

/** A CSS colour as [r, g, b], resolved by asking a canvas to paint it. */
function toRgb(colour) {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** The lon/lat box a ring covers. */
function ringBox(ring) {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    if (ring[i] < lonMin) lonMin = ring[i];
    if (ring[i] > lonMax) lonMax = ring[i];
    if (ring[i + 1] < latMin) latMin = ring[i + 1];
    if (ring[i + 1] > latMax) latMax = ring[i + 1];
  }
  return [lonMin, latMin, lonMax, latMax];
}

export function createGlobeMap({ map, view, onPick, label }) {
  const { centre, zoom: baseZoom } = viewToGlobe(view);

  /**
   * How far the globe may be turned from the view it was given.
   *
   * At world scale only the poles are out of bounds. Given a continent, the turn
   * is held inside it, so the player cannot drift off across an ocean when they
   * meant to look at Spain.
   */
  /**
   * How far out this map may be zoomed. A regional set holds coastline only so
   * far out, and zooming past it shows a sea that simply ends.
   */
  const minZoom = Math.max(MIN_ZOOM, map.minZoom ?? MIN_ZOOM);

  const bounded = baseZoom > 1.05;
  const holdInView = (lat, lon) => (bounded
    ? [clamp(lat, view[1], view[3]), clamp(lon, view[0], view[2])]
    : [clamp(lat, -85, 85), lon]);

  let zoom = baseZoom;
  let spin = { lat: centre[0], lon: centre[1] };

  /**
   * The lon/lat box the canvas can see from here, with `pad` times as much room.
   *
   * What is on screen is a cap of the sphere — everything within some angle of
   * the centre — and at zoom 1 that is a whole hemisphere. A cap's longitudes
   * spread as it nears a pole, and swallow every meridian once it reaches one.
   */
  function visibleWindow(lat, lon, z, pad) {
    const capRad = Math.min(Math.PI / 2, Math.asin(Math.min(1, 1 / z)) * pad);

    const latMin = Math.max(-90, lat - capRad * DEG);
    const latMax = Math.min(90, lat + capRad * DEG);

    const cosLat = Math.cos(lat * RAD);
    const sinCap = Math.sin(capRad);
    const lonHalf = cosLat <= sinCap ? 180 : Math.min(180, Math.asin(sinCap / cosLat) * DEG);

    return { lonMid: lon, lonHalf, latMin, latMax };
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'globe';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', label);

  const stage = document.createElement('div');
  stage.className = 'globe-stage';
  stage.append(canvas);

  /**
   * Two textures, because marking a place must not cost a redraw of the world.
   *
   * `base` holds the ocean and the land. `tex` is that image with the marked
   * places painted over it, which is a handful of paths and a blit.
   */
  const base = document.createElement('canvas');
  const baseCtx = base.getContext('2d');
  const texture = document.createElement('canvas');
  const tex = texture.getContext('2d', { willReadFrequently: true });

  const texWidth = TEXTURE_WIDTH;
  let texHeight = 2;

  // The window the texture currently holds, and the numbers drawing reads off
  // it. These move with the player.
  let held = visibleWindow(spin.lat, spin.lon, zoom, 1.6);
  let winLonMin = -180;
  let winLonSpan = 360;
  let winLatMin = -90;
  let winLatMax = 90;
  let winLatSpan = 180;

  let palette = null;
  let texels = null;
  let globe = createGlobe({ centre: [spin.lat, spin.lon], zoom }, 600);

  // Every land ring's box, worked out once, so a close-up can skip the rings it
  // cannot possibly show. Zoomed into Europe that is most of the world.
  const landBoxes = map.land.map(ringBox);

  /** Flat texture coordinates for a coordinate, in texture pixels. */
  const toTexture = (lon, lat) => [
    ((lon - winLonMin) / winLonSpan) * texWidth,
    ((winLatMax - lat) / winLatSpan) * texHeight,
  ];

  /**
   * Paint a set of rings into the texture, three times across, then fill.
   *
   * `edge` draws the outline as well. Its width is in texture pixels rather than
   * screen ones, which holds steady because the texture window tracks what is on
   * screen: zooming in narrows the window and the ground grows to match, so the
   * line stays about the same thickness to look at whatever the zoom.
   */
  function paint(ctx, rings, fill, { alpha = 1, boxes = null, edge = null } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = texWidth / 800;
      ctx.lineJoin = 'round';
    }

    for (const turn of [-360, 0, 360]) {
      ctx.beginPath();
      let drew = false;

      for (let r = 0; r < rings.length; r++) {
        // A ring that cannot reach the window is not worth walking.
        if (boxes) {
          const [lonMin, latMin, lonMax, latMax] = boxes[r];
          if (lonMax + turn < winLonMin || lonMin + turn > winLonMin + winLonSpan) continue;
          if (latMax < winLatMin || latMin > winLatMax) continue;
        }

        const ring = rings[r];
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = toTexture(ring[i] + turn, ring[i + 1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        drew = true;
      }

      if (drew) {
        ctx.fill('evenodd');
        if (edge) ctx.stroke();
      }
    }

    ctx.restore();
  }

  /** The ocean and the land, for whatever part of the world is on screen. */
  function buildBase() {
    baseCtx.fillStyle = palette.ocean;
    baseCtx.fillRect(0, 0, texWidth, texHeight);
    paint(baseCtx, map.land, palette.land, { boxes: landBoxes });
  }

  /**
   * Places coloured into the texture: shape to { style, settled }.
   *
   * Answers are never taken off the board — they settle instead, dropping to
   * half strength when the next question is asked, so the map fills in as the
   * round goes on while the newest answer still stands out among the old ones.
   */
  const marks = new Map();

  /** Lay the marked places over the base, then cache the pixels to sample. */
  function buildTexture() {
    tex.clearRect(0, 0, texWidth, texHeight);
    tex.drawImage(base, 0, 0);
    // Outlined, so a place that has been answered reads as a shape and not only
    // as a patch of colour — which is most of what there is to see once it has
    // settled back to half strength.
    for (const [shape, mark] of marks) {
      paint(tex, shape.rings, palette[mark.style], {
        alpha: mark.settled ? 0.55 : 1,
        edge: palette.shapeEdge,
      });
    }
    texels = tex.getImageData(0, 0, texWidth, texHeight).data;
  }

  /** Point the texture at a part of the world and repaint it. */
  function setWindow(box) {
    held = box;
    winLonMin = box.lonMid - box.lonHalf;
    winLonSpan = box.lonHalf * 2;
    winLatMin = box.latMin;
    winLatMax = box.latMax;
    winLatSpan = Math.max(0.0001, box.latMax - box.latMin);

    texHeight = clamp(Math.round((texWidth * winLatSpan) / winLonSpan), 2, 4096);
    if (base.width !== texWidth || base.height !== texHeight) {
      base.width = texWidth;
      base.height = texHeight;
      texture.width = texWidth;
      texture.height = texHeight;
    }

    buildBase();
    buildTexture();
  }

  /** Is what the player can see still inside the picture we hold, and sharp? */
  function windowCovers(lat, lon, z) {
    const need = visibleWindow(lat, lon, z, 1.05);
    if (need.latMin < held.latMin - 1e-6 || need.latMax > held.latMax + 1e-6) return false;

    // Longitude is a circle, so compare the offset between the two centres.
    const offset = ((need.lonMid - held.lonMid + 540) % 360) - 180;
    if (Math.abs(offset) + need.lonHalf > held.lonHalf + 1e-6) return false;

    // Held, but far coarser than the screen could show: worth a sharper one.
    return need.lonHalf > held.lonHalf * 0.45;
  }

  let refreshTimer = null;
  let wheelSettle = null;

  /**
   * Repaint the texture for where the player is now, once they stop moving.
   *
   * Repainting costs far more than a frame, so it waits for a pause rather than
   * running on every notch of the wheel. Until it lands the old texture is still
   * drawn, which is either a little soft or, past its edge, sky.
   */
  function scheduleWindowRefresh() {
    if (!palette || windowCovers(spin.lat, spin.lon, zoom)) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (windowCovers(spin.lat, spin.lon, zoom)) return;
      setWindow(visibleWindow(spin.lat, spin.lon, zoom, 1.6));
      draw();
    }, 220);
  }

  /**
   * Things drawn over the globe rather than into it, kept as coordinates so
   * they stay put on the ground when the globe turns.
   */
  let overlay = [];
  let settledOverlay = [];

  /** Where the player last pointed, and whether they are aiming by keyboard. */
  let aim = null;
  let aimingByKey = false;

  let image = null;
  let imageSize = 0;
  const buffer = document.createElement('canvas');
  const bufferCtx = buffer.getContext('2d');

  /**
   * Redraw the globe from the texture, one pixel at a time.
   *
   * `half` renders at half resolution and scales up, which is what keeps a drag
   * smooth; the full-resolution frame follows as soon as the drag stops.
   *
   * The inverse projection is worked out inline here rather than by calling
   * `globe.unproject`, which would allocate a pair of arrays for every pixel —
   * a third of a million of them a frame. Two identities make it cheap: the
   * angular distance c has sin(c) = rho, so the arcsine for it is not needed at
   * all, and rho then cancels out of both remaining terms.
   */
  function draw({ half = false } = {}) {
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    const n = half ? Math.max(100, size >> 1) : size;

    if (!image || imageSize !== n) {
      image = bufferCtx.createImageData(n, n);
      imageSize = n;
      buffer.width = n;
      buffer.height = n;
    }
    const pixels = image.data;

    // The buffer may be smaller than the canvas, so the globe's radius has to
    // be read in buffer pixels too.
    const radius = (globe.radius * n) / size;
    const middle = n / 2;
    const { sinLat0, cosLat0 } = globe;
    const centreLon = globe.centre[1];

    const hasTexture = texels !== null;
    const [oceanR, oceanG, oceanB] = palette.oceanRgb;
    // A whole turn of longitude, in texture pixels.
    const turn = (360 / winLonSpan) * texWidth;

    for (let py = 0; py < n; py++) {
      const dy = (middle - py) / radius;
      const dy2 = dy * dy;
      let index = py * n * 4;

      for (let px = 0; px < n; px++, index += 4) {
        const dx = (px - middle) / radius;
        const rho2 = dx * dx + dy2;

        // Sky. Left fully transparent so the page shows through.
        if (rho2 > 1) {
          pixels[index + 3] = 0;
          continue;
        }

        const cosC = Math.sqrt(1 - rho2);

        if (!hasTexture) {
          pixels[index] = oceanR;
          pixels[index + 1] = oceanG;
          pixels[index + 2] = oceanB;
          pixels[index + 3] = 255;
          continue;
        }

        const sinLat = cosC * sinLat0 + dy * cosLat0;
        const lat = Math.asin(sinLat < -1 ? -1 : sinLat > 1 ? 1 : sinLat) * DEG;
        const lon = centreLon + Math.atan2(dx, cosLat0 * cosC - dy * sinLat0) * DEG;

        // Longitude may need a turn to land inside the texture's window.
        let tx = ((lon - winLonMin) / winLonSpan) * texWidth;
        if (tx < 0) tx += turn;
        else if (tx >= texWidth) tx -= turn;
        const ty = ((winLatMax - lat) / winLatSpan) * texHeight;

        // Off the edge of the texture: ground we have no picture of yet.
        if (tx < 0 || tx >= texWidth || ty < 0 || ty >= texHeight) {
          pixels[index + 3] = 0;
          continue;
        }

        const t = ((ty | 0) * texWidth + (tx | 0)) * 4;
        pixels[index] = texels[t];
        pixels[index + 1] = texels[t + 1];
        pixels[index + 2] = texels[t + 2];
        pixels[index + 3] = 255;
      }
    }

    bufferCtx.putImageData(image, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buffer, 0, 0, n, n, 0, 0, size, size);
    drawOverlay(ctx);
  }

  /** How many canvas units across a shape is, at the middle of the globe. */
  const spanOf = (shape) => {
    const [lonMin, latMin, lonMax, latMax] = shape.bounds;
    const widest = Math.max(
      (lonMax - lonMin) * Math.cos(((latMin + latMax) / 2) * RAD),
      latMax - latMin,
    );
    return globe.radius * widest * RAD;
  };

  /** The circle a guess is measured by: what you see is what counts. */
  function drawRing(ctx, [x, y], colour, size) {
    ctx.beginPath();
    ctx.arc(x, y, AIM_RADIUS_PX, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(3, size / 200);
    ctx.strokeStyle = palette.ringEdge;
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, size / 400);
    ctx.strokeStyle = colour;
    ctx.stroke();
  }

  /** The aim ring, pins and miss lines, drawn on top of the pixels each frame. */
  function drawOverlay(ctx) {
    const size = canvas.width;
    ctx.save();
    ctx.lineCap = 'round';

    // Where the player is about to answer, when they are aiming by keyboard. A
    // mouse needs no such mark: the answer lands where the pointer already is.
    if (aimingByKey) drawRing(ctx, [size / 2, size / 2], palette.crosshair, size);

    // Where the player did answer. This is the same circle the guess is judged
    // against, so what counts as a hit is exactly what it looks like.
    if (aim) {
      const at = globe.project(aim);
      if (at) drawRing(ctx, at, palette.aim, size);
    }

    for (const item of [...settledOverlay, ...overlay]) {
      if (item.kind === 'pin') {
        const at = globe.project(item.coordinate);
        if (!at) continue;
        ctx.beginPath();
        ctx.arc(at[0], at[1], size / 110, 0, Math.PI * 2);
        ctx.globalAlpha = item.settled ? 0.55 : 1;
        ctx.fillStyle = palette[item.style];
        ctx.fill();
        ctx.lineWidth = Math.max(1, size / 300);
        ctx.strokeStyle = palette.pinEdge;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        const from = globe.project(item.from);
        const to = globe.project(item.coordinate);
        if (!from || !to) continue;

        ctx.beginPath();
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
        ctx.strokeStyle = palette.miss;
        ctx.lineWidth = Math.max(1.5, size / 220);
        ctx.setLineDash([size / 60, size / 60]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  const toVector = ([lat, lon]) => {
    const la = lat * RAD;
    const lo = lon * RAD;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };

  const toCoordinate = ([x, y, z]) => [
    Math.atan2(z, Math.hypot(x, y)) * DEG,
    Math.atan2(y, x) * DEG,
  ];

  /** Is a coordinate not just on the near side, but comfortably clear of the limb? */
  function wellInSight(coordinate) {
    const at = globe.project(coordinate);
    if (!at) return false;
    const dx = at[0] - canvas.width / 2;
    const dy = at[1] - canvas.width / 2;
    return Math.hypot(dx, dy) <= globe.radius * 0.82;
  }

  /**
   * Turn the globe, if it has to, so the answer can actually be seen.
   *
   * A sphere shows one hemisphere, so a revealed place may be round the back or
   * flattened into the limb — where showing a wrong answer teaches nothing. The
   * turn aims between the answer and where the player pointed, so the line
   * between the two stays on screen; when they are too far apart for both to
   * fit, the answer wins, because that is the part worth seeing.
   */
  function bringIntoView(coordinate) {
    if (wellInSight(coordinate) && (!aim || wellInSight(aim))) return;

    let target = coordinate;
    if (aim) {
      const a = toVector(coordinate);
      const b = toVector(aim);
      const mid = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
      const length = Math.hypot(...mid);
      // Near-antipodal picks average to nothing; there is no midpoint to use.
      if (length > 0.55) target = toCoordinate(mid.map((n) => n / length));
    }
    turnTo(target[0], target[1]);
  }

  /** Rebuild the projection for wherever the globe is now pointing. */
  function reproject(options) {
    globe = createGlobe({ centre: [spin.lat, spin.lon], zoom }, canvas.width);
    draw(options);
    scheduleWindowRefresh();
  }

  function turnTo(lat, lon, options) {
    const [heldLat, heldLon] = holdInView(lat, lon);
    spin = { lat: heldLat, lon: heldLon };
    reproject(options);
  }

  /**
   * Zoom about a point on the canvas, so whatever is under the pointer stays
   * under it. Zooming about the middle instead would slide the place being aimed
   * at out from under the player just as they closed in on it.
   */
  function zoomBy(factor, at = null, options) {
    const next = clamp(zoom * factor, minZoom, MAX_ZOOM);
    if (next === zoom) return;

    const anchor = at && globe.unproject(at);
    zoom = next;

    if (anchor) {
      globe = createGlobe({ centre: [spin.lat, spin.lon], zoom }, canvas.width);
      const after = globe.unproject(at);
      // Turn back by however far the anchor drifted under the pointer.
      if (after) {
        const [heldLat, heldLon] = holdInView(
          spin.lat + (anchor[0] - after[0]),
          spin.lon + (anchor[1] - after[1]),
        );
        spin = { lat: heldLat, lon: heldLon };
      }
    }

    reproject(options);
  }

  /** Match the canvas to its box on screen, then redraw. */
  function resize() {
    const box = canvas.getBoundingClientRect();
    const size = Math.max(200, Math.round(Math.min(box.width, box.height || box.width)));
    // Both have to be checked: a canvas starts out 300x150, so a box 300 wide
    // would otherwise leave the height alone and throw away half the drawing.
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    reproject();
  }

  let accepting = true;

  /** Pointers currently down, so a second finger can be told from a drag. */
  const pointers = new Map();
  let dragging = null;
  let pinch = null;
  let moved = false;

  const canvasPoint = (event) => {
    const box = canvas.getBoundingClientRect();
    const scale = canvas.width / box.width;
    return [(event.clientX - box.left) * scale, (event.clientY - box.top) * scale];
  };

  canvas.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, event);
    // A pointer on the globe is its own aim mark, so the keyboard ring goes.
    if (aimingByKey) {
      aimingByKey = false;
      draw();
    }
    canvas.setPointerCapture(event.pointerId);

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
      dragging = null;
      // A pinch is never a guess, however little the fingers moved.
      moved = true;
      return;
    }

    dragging = { x: event.clientX, y: event.clientY, lat: spin.lat, lon: spin.lon };
    moved = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, event);

    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch.distance > 0) {
        zoomBy(
          distance / pinch.distance,
          canvasPoint({
            clientX: (a.clientX + b.clientX) / 2,
            clientY: (a.clientY + b.clientY) / 2,
          }),
          { half: true },
        );
      }
      pinch.distance = distance;
      return;
    }

    if (!dragging) return;
    const dx = event.clientX - dragging.x;
    const dy = event.clientY - dragging.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;

    // A drag across the globe's width turns it about half a turn, and less than
    // that in proportion as the view is zoomed in, so the ground keeps up with
    // the finger instead of racing away from it.
    const perPixel = 180 / canvas.width / zoom;
    turnTo(dragging.lat + dy * perPixel, dragging.lon - dx * perPixel, { half: true });
  });

  const endPointer = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      const turned = dragging && moved;
      dragging = null;
      // Dragging and pinching draw at half resolution; settle at full.
      if (turned) draw();
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener(
    'wheel',
    (event) => {
      // The globe zooms; the page does not.
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.002), canvasPoint(event), { half: true });
      clearTimeout(wheelSettle);
      wheelSettle = setTimeout(() => draw(), 140);
    },
    { passive: false },
  );

  /** Answer where the player pointed, and leave the ring there. */
  function answer(coordinate, point) {
    aim = coordinate;
    draw();
    onPick({ point, coordinate });
  }

  canvas.addEventListener('click', (event) => {
    // A drag that turned the globe is not also a guess.
    if (!accepting || moved) return;
    const point = canvasPoint(event);
    const coordinate = globe.unproject(point);
    if (coordinate) answer(coordinate, point);
  });

  canvas.addEventListener('keydown', (event) => {
    if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(event.key === '-' || event.key === '_' ? 1 / 1.4 : 1.4);
      return;
    }

    if (!accepting) return;
    const step = event.shiftKey ? 2 : 10;
    const turns = {
      ArrowLeft: [0, -step], ArrowRight: [0, step],
      ArrowUp: [step, 0], ArrowDown: [-step, 0],
    };

    if (turns[event.key]) {
      event.preventDefault();
      // Aiming by keyboard from here on, so the middle gets a ring to aim with.
      aimingByKey = true;
      // One press covers the same amount of screen whatever the zoom, so the
      // arrows creep across a continent instead of leaping over it.
      const [dLat, dLon] = turns[event.key];
      turnTo(
        spin.lat + dLat / zoom,
        spin.lon + dLon / zoom / Math.max(0.15, Math.cos(spin.lat * RAD)),
      );
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // The arrows bring the target to the middle, so every place is reachable
      // by keyboard — including, at world scale, the ones round the back.
      aimingByKey = true;
      answer([spin.lat, spin.lon], [canvas.width / 2, canvas.width / 2]);
    }
  });

  canvas.addEventListener('blur', () => {
    if (!aimingByKey) return;
    aimingByKey = false;
    draw();
  });

  /** Zoom buttons, because a finger cannot turn a wheel. */
  const zoomButton = (text, name, factor) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'globe-zoom-button';
    button.textContent = text;
    button.setAttribute('aria-label', name);
    button.addEventListener('click', () => {
      zoomBy(factor);
      canvas.focus();
    });
    return button;
  };

  const zoomControls = document.createElement('div');
  zoomControls.className = 'globe-zoom';
  zoomControls.append(
    zoomButton('+', 'Zoom in', 1.6),
    zoomButton('−', 'Zoom out', 1 / 1.6),
  );
  stage.append(zoomControls);

  const observer = new ResizeObserver(() => resize());

  return {
    element: stage,
    /**
     * A live projection. The globe is rebuilt whenever it is resized, turned or
     * zoomed, so this must be read at the moment it is used — a copy taken when
     * the map was made goes stale the first time the player drags it.
     */
    get projection() {
      return globe;
    },
    renderedWidth: () => canvas.getBoundingClientRect().width || canvas.width,

    /** Called once the canvas is in the document and has a size. */
    mount() {
      palette = {
        ocean: colourOf(canvas, '--ocean', '#cfe0ea'),
        land: colourOf(canvas, '--land', '#e6e1d3'),
        correct: colourOf(canvas, '--correct', '#1c6b3f'),
        answer: colourOf(canvas, '--wrong', '#8a3c1d'),
        placed: colourOf(canvas, '--correct', '#1c6b3f'),
        miss: colourOf(canvas, '--wrong', '#8a3c1d'),
        aim: colourOf(canvas, '--accent', '#1d5e8a'),
        crosshair: colourOf(canvas, '--text', '#201d18'),
        shapeEdge: colourOf(canvas, '--shape-edge', '#000000'),
        pinEdge: colourOf(canvas, '--surface', '#ffffff'),
        ringEdge: colourOf(canvas, '--surface', '#ffffff'),
      };
      palette.oceanRgb = toRgb(palette.ocean);

      // Painting the land takes a moment. Showing a bare globe first and filling
      // it in on the next frame is the difference between the question appearing
      // at once and the page sitting still while it is drawn.
      resize();
      observer.observe(canvas);
      requestAnimationFrame(() => {
        setWindow(visibleWindow(spin.lat, spin.lon, zoom, 1.6));
        draw();
      });
    },

    destroy() {
      observer.disconnect();
      clearTimeout(refreshTimer);
      clearTimeout(wheelSettle);
    },

    setAccepting(value) {
      accepting = value;
      canvas.classList.toggle('is-locked', !value);
    },

    /** Turn the globe so a coordinate is in the middle. */
    lookAt([lat, lon]) {
      turnTo(lat, lon);
    },

    /**
     * Ready for the next question: the working-out goes, the answer stays.
     *
     * What was just answered settles into the board rather than being wiped off
     * it, so the map fills in over a round. Only the line to a missed answer and
     * the ring the player aimed with are cleared, because those are about the
     * question that has now been answered.
     */
    clear() {
      for (const item of overlay) {
        if (item.kind === 'pin') settledOverlay.push({ ...item, settled: true });
      }
      overlay = [];
      aim = null;
      for (const mark of marks.values()) mark.settled = true;
      buildTexture();
      draw();
    },

    /** Clear everything, including places already put on the board. */
    reset() {
      overlay = [];
      settledOverlay = [];
      aim = null;
      marks.clear();
      buildTexture();
      draw();
    },

    /** Put a place on the board for good, where a correct answer belongs. */
    place(shape) {
      marks.set(shape, { style: 'placed', settled: true });
      if (spanOf(shape) < canvas.width * PIN_BELOW) {
        settledOverlay.push({
          kind: 'pin', coordinate: shape.point, style: 'placed', settled: true,
        });
      }
      buildTexture();
      draw();
    },

    /** Show a place's shape, filled, turning the globe if it is out of sight. */
    reveal(shape, { correct }) {
      marks.set(shape, { style: correct ? 'correct' : 'answer', settled: false });
      // A place smaller than a few pixels needs a marker, or revealing Malta
      // shows nothing at all.
      if (spanOf(shape) < canvas.width * PIN_BELOW) {
        overlay.push({
          kind: 'pin',
          coordinate: shape.point,
          style: correct ? 'correct' : 'answer',
          settled: false,
        });
      }
      buildTexture();
      bringIntoView(shape.point);
      draw();
    },

    /**
     * Draw the gap between where the player pointed and the answer.
     *
     * Both ends are coordinates rather than canvas points, so they stay on the
     * ground they mean when the globe turns under them.
     */
    markMiss(from, coordinate) {
      overlay.push({ kind: 'miss', from, coordinate });
      draw();
    },
  };
}
