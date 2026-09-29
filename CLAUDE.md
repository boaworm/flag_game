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
sharing a map, a flag each, and a way of being divided up: countries of the world
grouped by continent, or US states grouped by census region. Modes are written
against this shape and never against countries, which is what let the United
States be added without touching a mode.

A set is one entry in `src/data/sets.js` plus a builder in `tools/`. Anything
user-facing that would otherwise say "country" comes from the set: `set.noun`,
`set.plural`, `set.groupLabel`.

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

The four modes are specified in `README.md`. These are the decisions that follow
from them; keep them consistent rather than solving each one per-mode.

**Configurable choice count.** Modes 1 and 2 present N options, set in settings, not
hardcoded per mode. Distractors should be plausible — same region, or a
similar-looking flag — because picking randomly from 195 countries makes an easy
question at any N.

**Typed answers (mode 1).** Accept more than one exact string. Compare on a
normalized form: lowercase, diacritics stripped, punctuation and leading "the"
removed. Keep a per-country list of accepted names in the data (official name,
common name, and widely-used alternatives) rather than matching logic that special-
cases countries in code. Allow a small edit distance so a near-miss spelling counts
— kids will type "Portugual" — and show the correct spelling when it does.

**Geometry is stored unprojected.** Shapes live in longitude and latitude, and
`lib/geo.js` builds a projection per view. Projecting at build time would bake in
one canvas size, and the same shapes have to be drawn at world scale and zoomed
into a single continent.

**Map projection.** Equidistant cylindrical: longitude and latitude both map
linearly, with longitude scaled by the cosine of the view's middle latitude so a
region is not stretched sideways. Nicer projections exist, but mode 4 has to turn
a click back into a coordinate to measure the miss, and linear-in-both-axes is
what makes that inverse exact. `lib/geo.js` is the only module that knows about
pixels.

**The antimeridian will bite you.** It has, repeatedly, and every rule the
builders use to decide what frame a shape is stored in has drawn blood:

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

The renderer places each longitude at whichever of lon, lon±360 is nearest the
view's centre. "Nearest" is load-bearing: normalising into a turn starting at the
view's western edge flings an island just west of that edge a full turn east, and
the line back to it crosses the whole map.

**Distance feedback (mode 4).** Great-circle distance via the haversine formula,
reported in kilometres. Measure to the country's shape, not its centroid — clicking
western Russia should not be scored as a miss because the centroid is in Siberia. A
click inside the country's shape is correct; otherwise measure to the nearest point
on its border. Round to something a kid can read: tens of km when close, hundreds
when far.

**Country shapes.** Modes 3 and 4 both need per-country geometry, in the same
projection as the base map. The base map is continent outlines only — it must not
show internal borders, or modes 3 and 4 give the answer away.

**Hit tolerance.** Every place is given a minimum target size on screen, about
twelve pixels of radius, and only places already smaller than that get any slack:
Brazil and Russia get none.

This is measured against what is actually rendered rather than set as a fixed
distance, and that is deliberate. Malta is 27 km across; on a world map drawn 900
pixels wide, one pixel is about 45 km, so Malta is a third of a pixel — not hard
to hit but impossible. A fixed kilometre tolerance either leaves the microstates
unplayable or makes Denmark count as Sweden. Scaling with the rendering also means
a smaller screen is not a harder game, which was the point of the rule this
replaces. Choosing a continent zooms the map in and the slack shrinks towards
nothing on its own.

## Working with kids' UX in mind

This is the part that is easy to get wrong. When adding or changing gameplay:

- Touch targets at least 44x44 px. Assume a tablet, not a mouse.
- Reading level matters more than word count. Short sentences, common words.
- A wrong answer shows the correct one and moves on. No score penalties, no
  "you failed" framing, no countdown timers unless a mode is explicitly about speed.
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
