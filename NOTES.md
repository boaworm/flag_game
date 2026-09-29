# Where things stand

Working notes for picking this up again. Delete this file once the globe lands.

Last verified: all six modes played end to end in headless Chrome, console clean,
no failed requests, no horizontal overflow at 390px.

## What works right now

Two sets, six modes, all playable:

| Mode | What it does |
| --- | --- |
| Guess the flag | Flag shown, name it — by choices or by typing |
| Find the flag | Name shown, pick its flag from several |
| Match them up | Tap a flag, tap its place; 4–8 pairs |
| Point to it on the map | Name shown, click where it is; miss gives distance in km |
| Place the shape | Outline shown with no name, click where it belongs; correct ones stay on the board |
| Streak | Place the shape, endlessly, until a miss. Personal best per set and group |

Sets: **world** (193 UN member states, by continent, Americas split north/south)
and **usa** (50 states, by census region). Picking a continent or region also
zooms the map, which is what makes small places clickable.

## The map is mid-migration — read this first

The modes currently use the **flat map** (`src/ui/map.js`, projection in
`src/lib/geo.js`). It works and is not broken.

A **globe** is half-built alongside it and is not wired into anything:

- `src/lib/globe.js` — orthographic projection. Done and correct. Round-trips to
  4e-7 degrees over 20k random points.
- `src/ui/globe.js` — raster globe renderer. Renders the world beautifully at
  zoom 1; **zoomed continent views are broken** (see below).

Nothing imports either file yet. Deleting both would leave a working game.

### Why the globe at all

Every flat map needs a seam, and shapes crossing it must be detected, shifted or
split. Getting that wrong draws a line clean across the map, which happened four
separate times, each with a different cause:

1. A ring holding both +179 and -179 — fixed by detecting a jump between
   *consecutive* points rather than a wide shape (Eurasia spans 200° without
   crossing anything).
2. Normalising longitude into a turn starting at the view's western edge flung an
   Aleutian island a full turn east — fixed by placing each longitude nearest the
   view's centre.
3. Shape-level unwrapping firing on any shape spanning >180°, which tore Eurasia
   open at Greenwich.
4. The same guard comparing noise on the land layer, whose features are
   globally-scattered ring collections where both framings measure ~360°. Fixed
   by not unwrapping the land layer at all — it is only ever drawn.

A sphere has no seam, so none of these can arise. That is the whole argument.

### The open globe bug

At zoom 1 (`views.All`) the globe renders perfectly — verified by screenshot.

At a continent zoom (Europe, Africa, Oceania) it renders mostly black with the
visible content in the wrong place. Black comes from the "outside the texture
window" branch in `draw()`.

Two hypotheses, neither yet tested — **probe before changing anything**:

- The effective zoom is not what `viewToGlobe` returns, so far more of the
  hemisphere is on screen than the texture window covers. The black boundary in
  the screenshot is a curve consistent with a *latitude* limit, which is what you
  would see if the globe were at zoom 1 while the texture only covered Europe.
- The `tx` wrap in `draw()` is wrong for a narrow window. It adds
  `(360 / winLonSpan) * texWidth`, which for a 119°-wide window is 6196 pixels —
  far outside the texture, so it falls through to the sky branch.

The next step is to print, for a handful of canvas positions, what `unproject`
gives and what `tx`/`ty` come out as. Do not reason about it further without
that — reasoning about which wrap fires is exactly what cost the most time.

### Globe work still to do after that

- **Sky is currently black.** It should be transparent so the page background
  shows through.
- **44 ms per redraw** at 600px, so dragging is about 22fps. Two easy wins:
  inline the inverse projection into the pixel loop (it currently calls
  `globe.unproject`, allocating 360k arrays per frame), and redraw at half
  resolution while a drag is in progress.
- Texture build is ~1.5s. One-off, but worth moving off the first paint.
- Then wire it into `point-to-country` and `place-the-shape` in place of
  `createMap`, keeping the same interface: `element`, `projection`,
  `renderedWidth()`, `setAccepting`, `clear`, `reset`, `reveal`, `place`,
  `markMiss`. The globe already implements all but `markMiss`.

Rotation is meant to be world-view only; a continent view is centred on its
continent and does not rotate. That is already how `createGlobeMap` is written.

## Things worth not relearning

- **Hit-testing, distances and shape cards are projection-independent.** They all
  work in latitude and longitude. Swapping the map for a globe does not touch
  them.
- **Every place is clickable** because each gets a minimum target size measured
  against what is rendered, not a fixed distance in km. Malta is a third of a
  pixel on a world map; a fixed tolerance either makes microstates impossible or
  makes Denmark count as Sweden.
- **Shape data is deliberately relative.** Absolute thresholds destroyed small
  countries — Monaco came out a quadrilateral and the Maldives lost 1199 of its
  1200 islands. Simplification is a fraction of each ring's own width and rings
  are kept in proportion to the largest.
- **`shape.point` is not the dataset's coordinates.** It is computed to be inside
  the shape, because mledoze puts Fiji in the sea between its islands.
- **`shape.core` is not `shape.bounds`.** Core ignores distant territory so a
  shape card frames Norway's mainland rather than its island near Antarctica.
- The builders assert what they expect — 193 members, 50 states, every place has
  a shape. Let them fail loudly.

## Agreed but not built

- The menu is heading for six modes and six settings rows. It wants grouping by
  what it teaches — flags, shapes, places — before it grows again.
- A capitals mode. The US data already carries capitals; the world data does too.
- Alaska and Hawaii as insets, if the flat map survives. Moot if the globe lands.
- Drag-and-drop for match mode as an enhancement over tapping. Tapping works on
  touch and keyboard, so this is polish, not a gap.
