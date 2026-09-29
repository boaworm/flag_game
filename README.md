# Flag Game

A browser-based learning game that teaches kids the flags, names, and locations of
the world's countries.

No server, no build step, no dependencies. Open `index.html` in a browser and play.

## Why

Most flag quizzes test recall of one thing: the flag. Kids learn geography better
when the flag, the country's name, and *where it actually is* are connected in the
same activity. This game pairs all three, and asks about location with a map the
player has to reason about — continent outlines only, no borders to read the answer
off of — rather than a multiple-choice list.

## Game modes

**1. Guess the flag**
A random flag is shown. The player either types the country's name or picks it from
a set of choices. The number of choices is configurable.

**2. Guess the country's flag**
The reverse: a country name is shown, and the player picks its flag from a set of
flags. The number of choices is configurable.

**3. Place the country**
A world map showing only continent outlines — no borders. The player is given a
country's shape and drags it to where it belongs.

**4. Point to the country**
The same continent-only map. The player is asked for a country and clicks where they
think it is. A correct click fills in that country's shape on the map. A miss tells
them how far off they were, in kilometres.

Modes are scoped by region (Europe, Africa, Asia, Americas, Oceania, or the whole
world) and by difficulty, so a 6-year-old and a 12-year-old can both play.

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
index.html          Entry point and app shell
src/
  main.js           Boots the app, wires up routing between screens
  modes/            One module per game mode
  ui/               Reusable screen pieces (buttons, score bar, result card)
  data/             Country data loading and lookup helpers
  lib/              Small helpers: shuffle, scoring, storage
assets/
  flags/            One SVG per country, named by ISO 3166-1 alpha-2 code
  map/              Continent-outline base map plus per-country shape paths
data/
  countries.json    Name, ISO code, region, capital, borders, coordinates
styles/             CSS, one file per area
```

## Design principles

- **Kid-first.** Big touch targets, no timers by default, no penalty for a wrong
  guess beyond being shown the right answer.
- **Offline-capable.** Every asset is local. The game works on a tablet on a plane.
- **Accessible.** Keyboard playable, readable contrast, and never color-only as the
  sole signal for right or wrong.
- **Neutral on politics.** Country lists and borders follow a documented source;
  disputed cases are noted in the data rather than silently decided.

## Roadmap

- [ ] App shell, screen routing, settings, and the country data set
- [ ] Mode 1 — Guess the flag (choices, then typed answers)
- [ ] Mode 2 — Guess the country's flag
- [ ] Continent-outline map and per-country shape geometry
- [ ] Mode 4 — Point to the country, with distance feedback
- [ ] Mode 3 — Place the country shape
- [ ] Per-player progress saved in `localStorage`
- [ ] Spaced repetition so missed countries come back sooner
- [ ] Translations of the interface

## Contributing

Issues and pull requests are welcome. Please keep the no-build-step, no-dependency
constraint intact — see `CLAUDE.md` for the conventions this project follows.

## Licensing

Code is MIT licensed. Flag and map SVGs are third-party assets; each source and its
license is recorded in `assets/ATTRIBUTION.md` as assets are added.
