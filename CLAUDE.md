# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

A browser-based game that teaches kids flags, country names, and country locations.
See `README.md` for the game modes and project layout.

## Hard constraints

These are the point of the project. Do not relax them without being asked.

- **No build step.** No bundler, no transpiler, no `npm run build`. The files in the
  repo are the files the browser loads.
- **No runtime dependencies.** No npm packages, no CDN `<script>` tags, no external
  fonts or APIs. Everything ships in the repo so the game works offline. The
  builders in `tools/` do fetch from the network — that is fine, because their
  output is committed and the game only ever loads that.
- **Plain ES modules.** Use `import`/`export` with native module scripts
  (`<script type="module">`). Modern browsers only; no transpilation, no polyfills.
- **Static hosting only.** Nothing may require a server beyond serving files, so
  the game can be published on GitHub Pages as-is.

Dev-only tooling (a formatter, a test runner, a linter) is acceptable as a
`devDependency` if it is ever needed, but it must never be required to play the game.

## Code conventions

- Modern JavaScript: `const`/`let`, arrow functions, `async`/`await`, optional
  chaining. No jQuery-era patterns, no `var`.
- One module per concern. A file that does two unrelated things should be two files.
- Game modes live in `src/modes/` and each export the same shape, so `main.js` can
  start any of them without special-casing. Follow the existing mode's interface
  when adding a new one.
- DOM building goes through the helpers in `src/ui/`. Avoid scattering
  `innerHTML` string concatenation across mode files, and never interpolate
  untrusted or data-file text into `innerHTML`.
- CSS lives in `styles/`, not in inline `style` attributes and not in JS. Use CSS
  custom properties for colors and spacing so theming stays in one place.
- No framework. If a piece of state handling feels like it wants React, write a
  small explicit function instead.

## Sets

The game is not about countries; it is about **sets**. A set is a group of places
sharing a map: countries of the world, US states, places of the Greek world.
Modes are written against this shape and never against countries, which is what
let the United States be added without touching a mode.

A set is one entry in `src/data/sets.js` plus a builder in `tools/`. Anything
user-facing that would otherwise say "country" comes from the set: `set.noun`,
`set.plural`, `set.groupLabel`.

**A set says what it has; a mode says what it needs.** Not every set can feed
every mode, and the answer is a declaration on each rather than a check inside a
mode:

- `set.flags` — a flag for each place, or null
- `set.outlines` — shapes distinctive enough to be recognised on their own
- `mode.needs` — the list of those a mode cannot do without

**Dividing a set up is optional too.** `set.groupLabel` names the division —
"Part of the world", "Part of the country" — and a set with none is not divided:
the row is not offered and the whole set is always in play. Narrowing exists to
make a big set approachable and to zoom the map to a region worth zooming to.
Sixteen places of the Greek world are one map's worth as they stand, so asking
which part to practise before practising any of it would be a choice with no
question behind it. Each place still records its region in the data.

Only the sets that fit are offered when a mode is set up, and a set in play that
does not fit is swapped for one that does. Ancient Greece has neither: its city
states have no settled banner, and inventing one would teach something false,
while most of its places are sites rather than territories. Knossos is a palace,
and its outline is a circle drawn round a point — real enough to click, and
nonsense to ask someone to recognise.

**A place need not have a territory.** Where a set has no real outline for a
place, the builder gives it a small circle, which the game already draws as a pin
because it is below the size a shape can be seen at. Everything downstream — hit
testing, distance, revealing — works on rings and does not care that these ones
were drawn rather than surveyed. Islands in that same set still take their real
coastline, because Crete is worth seeing.

**A regional set holds only its own corner of the world**, so its map says how
far out it may be zoomed (`map.minZoom`). Without that, zooming out from Greece
reaches a sea that simply stops.

## Data conventions

- `data/sets/<id>/entries.json` and `map.json` are the single source of truth.
  Code must not hardcode a place name, code, or list anywhere.
- **Both files are generated.** Fix data by changing the builder in `tools/` and
  re-running it, never by editing the JSON.
- Places are keyed by `code` — lowercase ISO 3166-1 alpha-2 for countries, postal
  code for states. Flag files match: `assets/flags/<set>/<code>.svg`.
- Every entry needs `code`, `name`, `group`, `coordinates` and `acceptedNames`
  (the strings a typed answer may match). `capital` where the set has them.
- Every shape needs `rings`, `bounds` and `point`. `point` is a coordinate
  guaranteed to be *inside* the shape, and is what the game points at — a
  dataset's own coordinates are often a bounding-box centre, which for an
  archipelago is open water.
- A builder should assert what it expects (193 UN members, 50 states, every place
  has a shape) so that a changed upstream source fails loudly instead of quietly
  producing a different game.
- When a place's status is disputed or its source is ambiguous, record the reason
  in the builder rather than quietly picking a side.

## Mode mechanics

The six modes are specified in `README.md`. These are the decisions that follow
from them; keep them consistent rather than solving each one per-mode.

**Configurable choice count.** The two naming modes — guess the flag and find
the flag — present N options, set in settings, not
hardcoded per mode. Distractors should be plausible — same region, or a
similar-looking flag — because picking randomly from 195 countries makes an easy
question at any N.

**Typed answers (guess the flag).** Accept more than one exact string. Compare on a
normalized form: lowercase, diacritics stripped, punctuation and leading "the"
removed. Keep a per-country list of accepted names in the data (official name,
common name, and widely-used alternatives) rather than matching logic that special-
cases countries in code. Allow a small edit distance so a near-miss spelling counts
— kids will type "Portugual" — and show the correct spelling when it does.

**Geometry is stored unprojected.** Shapes live in longitude and latitude, and
`lib/globe.js` builds a projection per view. Projecting at build time would bake
in one canvas size, and the same shapes have to be drawn at world scale and
zoomed into a single continent.

**The map is a globe.** Orthographic — the Earth as seen from far away — and it
is drawn a pixel at a time rather than as vector paths: every pixel inside the
disc is turned back into a coordinate and looked up in a flat texture. That is
what makes the far side "this pixel is sky" instead of polygon clipping at the
horizon, and it is why there is no seam anywhere. The projection is exact in both
directions, which pointing at a place needs in order to turn a click back into a
coordinate and measure the miss. `lib/globe.js` is the only module that knows about pixels;
everything in `lib/geo.js` works in latitude and longitude and is true of any
projection.

A flat map was tried first and is in the history. It worked, but every flat map
has to cut the sphere open somewhere, and four separate bugs drew a line clean
across it. A sphere has no cut, so that entire class of bug cannot arise.

**The player drives the globe.** Dragging turns it, the wheel and a pinch zoom
it, and the arrow keys and Enter do both without a pointer. The texture holds
only the part of the world on screen and is repainted after the player stops
moving, which is what lets a close-up be sharp without holding the whole world at
that detail. Nothing marks the middle of the globe unless the player is aiming by
keyboard, because a pointer is its own aim mark.

**The antimeridian will bite you.** It has, repeatedly, and the globe only takes
it out of the *renderer*. The builders still have to decide what frame a shape is
stored in, and every rule there has drawn blood:

- A ring holding both +179 and -179 must be detected by a jump between
  *consecutive* points, never by being wide — Eurasia spans 200° without crossing
  anything, and shifting it tears it open at Greenwich instead.
- The same test must not be applied to the land layer, whose features are
  globally-scattered collections of rings where both framings measure ~360°.
- A shape is only a candidate for shifting if it has land near *both* edges. Test
  "is it narrower once shifted" on its own and a shape lying wholly in the west
  compares two spans that are equal by construction — whereupon floating point
  decides it, because adding 360 to a longitude near -73 loses precision. That
  threw 22 states and 27 countries a full turn east, silently, and the views
  computed from their bounds with them.
- Longitude cannot be min-maxed at all when computing a view. The smallest arc
  containing every member has to be found, or the United States comes out 424°
  wide — every longitude there is, and then some.

Anything derived from a shape's longitude is suspect until it has been looked at
on screen. All of these were invisible in the numbers.

**Distance feedback (point to it on the map).** Great-circle distance via the haversine formula,
reported in kilometres. Measure to the country's shape, not its centroid — clicking
western Russia should not be scored as a miss because the centroid is in Siberia. A
click inside the country's shape is correct; otherwise measure to the nearest point
on its border. Round to something a kid can read: tens of km when close, hundreds
when far.

**Country shapes.** Placing a shape and pointing at a place both need
per-country geometry, in the same projection as the base map. The base map is continent outlines only — it must not
show internal borders, or modes 3 and 4 give the answer away.

**Answers stay on the board.** A place that has been asked about is never taken
off the map — it settles to half strength when the next question comes, so a
round fills the map in and the newest answer still stands out against the ones
before it. That was how the shape modes already behaved, and it is now how every
map mode behaves.

**A guess is a circle, not a point.** Clicking draws a ring where the player
clicked, and the guess counts if that ring overlaps the place anywhere. The ring
is the rule made visible: there is nothing to explain, because what counts as a
hit is exactly what it looks like.

The ring is a fixed number of screen pixels, not a fixed number of kilometres,
and that is deliberate. Malta is 27 km across; on a world globe drawn 900 pixels
wide one pixel is about 45 km, so Malta is a third of a pixel — not hard to hit
but impossible. A fixed kilometre tolerance either leaves the microstates
unplayable or makes Denmark count as Sweden. Measuring in pixels also means a
smaller screen is not a harder game.

Zooming in is therefore what makes an answer precise: the ring keeps its size on
screen while the ground under it shrinks, from roughly 290 km across at world
scale to 36 km at eight times in. A player who wants to pick out Luxembourg
zooms until they can.

This replaces an earlier rule where only places smaller than the ring got any
slack, so Brazil got none. Giving every place the same ring is both simpler to
implement and simpler to understand, and for anything bigger than the ring it
comes to the same thing — you have to click on it.

## Working with kids' UX in mind

This is the part that is easy to get wrong. When adding or changing gameplay:

- Touch targets at least 44x44 px. Assume a tablet, not a mouse.
- Reading level matters more than word count. Short sentences, common words.
- A wrong answer shows the correct one and moves on. No score penalties, no
  "you failed" framing, no countdown timers unless a mode is explicitly about speed.
- There is always a way out. A round in progress keeps a way back to the menu,
  and leaving asks nothing — there is no score to lose, so a confirmation box
  would only be an obstacle between a child and the thing they want.
- Never signal correct/incorrect with color alone — pair it with an icon or text.
- Keep the whole game keyboard-navigable and respect
  `prefers-reduced-motion`.

## Testing and verification

- There is no test runner yet. When adding one, keep it dev-only (see above).
- Data is generated; see Data conventions above.
- Verify map changes by looking at a rendered map, not only at numbers. Both
  antimeridian bugs were invisible in the data and obvious on screen.
- Verify changes by actually loading the game: `python3 -m http.server 8000` and
  open `http://localhost:8000`. Check the browser console is clean.
- Data changes should be validated — a missing flag file or a border pointing at an
  unknown ISO code should be caught before it reaches a player.

## Repository

- GitHub: `boaworm/flag_game`, public.
- Default branch: `main`.
- Commit in small, focused commits with imperative subject lines
  ("Add map mode hit detection", not "map stuff").
