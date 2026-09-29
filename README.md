# Flag Game

A browser-based learning game that teaches kids the flags, names, and locations of
the world's countries.

No server, no build step, no dependencies. Open `index.html` in a browser and play.

## Why

Most flag quizzes test recall of one thing: the flag. Kids learn geography better
when the flag, the country's name, and *where it actually is* are connected in the
same activity. This game pairs all three, and asks about location on a globe the
player has to reason about — coastlines only, no borders to read the answer off
of — rather than a multiple-choice list.

## What you can learn

Two sets, picked in the menu:

- **Countries of the world** — all 193 UN member states, playable as a whole or
  one continent at a time: Africa, Asia, Europe, North America, South America,
  Oceania.
- **The United States** — the 50 states with their flags and capitals, playable
  as a whole or by region: West, Midwest, South, Northeast.

Narrowing to a continent or region does more than shorten the list: it zooms the
map in, which is what makes the small places clickable at all.

## Game modes

All six are built and playable.

**Guess the flag**
A flag is shown. The player either types the name or picks it from a set of
choices. The number of choices is configurable, from two to eight.

**Find the flag**
The reverse: a name is shown, and the player picks its flag from a set of flags.

**Match them up**
Four to eight places and their flags, shuffled. Tap a flag, then tap its place.
Tapping rather than dragging, so it works by touch and from a keyboard alike.

**Point to it on the map**
A globe showing only outlines — coastlines for the world, the national outline
for the United States, and never any internal borders, so it cannot give an
answer away. The player is asked for a place and clicks where they think it is. A
hit fills the shape in. A miss fills it in too, and says how far off the guess
was in kilometres. If the answer is round the back, the globe turns to show it.

**Place the shape**
A place's outline on its own, with no name. The player clicks where on the globe
it belongs. Answers stay on the board, so the map fills in as the round goes on.

**Streak**
Place the shape, one after another, until a miss ends the run. A personal best is
kept per set and group.

Every map mode is playable with the mouse, by touch, or from the keyboard: the
arrow keys turn the globe and Enter picks whatever is under the crosshair.

## Running it

```sh
git clone https://github.com/boaworm/flag_game.git
cd flag_game
```

Then either open `index.html` directly, or serve the folder to avoid browser
restrictions on local ES modules and `fetch`:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

Any static file server works. There is nothing to install and nothing to compile.

## Project layout

```
index.html             Entry point and app shell
src/
  main.js              Boots the app, menu, settings, round summary
  settings.js          What the player chose, remembered between sessions
  modes/               One module per game mode
  ui/                  DOM helper, the globe, and the shape and flag views
  data/sets.js         The set registry and its loaders
  lib/                 quiz (rounds, distractors), globe and geo, matching, storage
assets/
  flags/world/         One SVG per country, by ISO 3166-1 alpha-2 code
  flags/usa/           One SVG per state, by postal code
data/sets/
  world/               entries.json and map.json for the world set
  usa/                 entries.json and map.json for the United States
tools/
  build-world.mjs      Rebuilds the world set (dev-only, never shipped)
  build-usa.mjs        Rebuilds the United States set
  lib/geojson.mjs      Shared geometry helpers for the builders
styles/                CSS, one file per area
```

Typed answers accept more than the obvious spelling. Native names count, so
"Sverige" works for Sweden and "Deutschland" for Germany, and a near miss is
accepted and shown the correct spelling — but not at the cost of letting Iran
pass for Iraq.

To rebuild a set from its upstream sources:

```sh
node tools/build-world.mjs
node tools/build-usa.mjs
```

These are developer tooling. The game never runs them; the browser only ever
loads their committed output. Downloads are cached in `.cache/`, which is
git-ignored — delete it to force a refresh.

## Design principles

- **Kid-first.** Big touch targets, no timers by default, no penalty for a wrong
  guess beyond being shown the right answer.
- **Offline-capable.** Every asset is local. The game works on a tablet on a plane.
- **Accessible.** Keyboard playable, readable contrast, and never color-only as the
  sole signal for right or wrong.
- **Neutral on politics.** Country lists and borders follow a documented source;
  disputed cases are noted in the data rather than silently decided.

## Roadmap

- [x] App shell, screen routing, settings
- [x] Guess the flag (choices and typed answers)
- [x] Map geometry, continent and region views
- [x] Point to it on the map, with distance feedback
- [x] A second set: the United States
- [x] Find the flag, match them up, place the shape, and streak
- [x] A globe in place of the flat map, so there is no seam to draw wrongly
- [ ] A capitals mode, now that the data carries them
- [ ] Alaska and Hawaii as insets, so the US view wastes less ocean
- [ ] Per-player progress saved in `localStorage`
- [ ] Spaced repetition so missed places come back sooner
- [ ] Translations of the interface

## Contributing

Issues and pull requests are welcome. Please keep the no-build-step, no-dependency
constraint intact — see `CLAUDE.md` for the conventions this project follows.

## Licensing

Code is MIT licensed. Flags, country data and map geometry are third-party
assets under their own licenses — each source is recorded in
`assets/ATTRIBUTION.md`.
