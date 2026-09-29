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
  fonts or APIs. Everything ships in the repo so the game works offline.
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

## Data conventions

- `data/countries.json` is the single source of truth for country facts. Code must
  not hardcode country names, codes, or lists anywhere else.
- Countries are keyed by **ISO 3166-1 alpha-2** code, lowercase (`se`, `fr`, `br`).
  Flag files match: `assets/flags/se.svg`.
- Keep the data set machine-checkable: every country needs `name`, `iso2`,
  `region`, `capital`, `borders` (array of iso2), and `coordinates` (`[lat, lon]`).
- When a country's status is disputed or its data source is ambiguous, record the
  reason in the entry rather than quietly picking a side.

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
- Verify changes by actually loading the game: `python3 -m http.server 8000` and
  open `http://localhost:8000`. Check the browser console is clean.
- Data changes should be validated — a missing flag file or a border pointing at an
  unknown ISO code should be caught before it reaches a player.

## Repository

- GitHub: `boaworm/flag_game`, public.
- Default branch: `main`.
- Commit in small, focused commits with imperative subject lines
  ("Add map mode hit detection", not "map stuff").
