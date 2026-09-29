# Asset and data attribution

Everything here is generated or downloaded by the scripts in `tools/`, and the
results are committed. Re-run a builder to refresh its set.

## Country flags — `assets/flags/world/`

4:3 SVG flags, one per country, named by lowercase ISO 3166-1 alpha-2 code.

- **Source:** [flag-icons](https://github.com/lipis/flag-icons) by Panayiotis
  Lipiridis, fetched from jsDelivr at a pinned version
- **License:** MIT
- **Fetched by:** `tools/build-world.mjs`

## State flags — `assets/flags/usa/`

One SVG per state, named by lowercase postal code.

- **Source:** [Wikimedia Commons](https://commons.wikimedia.org/), each file's
  canonical `Flag_of_<State>.svg`
- **License:** US state flags are generally in the public domain; each file's
  page on Commons records its own status
- **Fetched by:** `tools/build-usa.mjs`

Some of these are large — a few carry a detailed state seal, and the biggest is
around 600 KB. The game loads one flag at a time, so this costs a moment on a
slow connection rather than a slow start.

## Country data — `data/sets/world/entries.json`

- **Source:** [mledoze/countries](https://github.com/mledoze/countries)
- **License:** ODbL 1.0 for the data
- **Built by:** `tools/build-world.mjs`

Filtered to the 193 UN member states. One correction is applied: the source marks
the Holy See as a UN member, but it is a permanent observer state.

## State data — `data/sets/usa/entries.json`

- **Sources:** Natural Earth for names, postal codes and census regions; the
  capitals table in `tools/build-usa.mjs`
- **Built by:** `tools/build-usa.mjs`

The 50 states. The District of Columbia is excluded: it is not a state.

## Map geometry — `data/sets/*/map.json`

Coastlines, national and state outlines, and the shape of every place.

- **Source:** [Natural Earth](https://www.naturalearthdata.com/) 10m, via
  [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector)
  — layers `ne_10m_land`, `ne_10m_admin_0_countries`,
  `ne_10m_admin_1_states_provinces`
- **License:** public domain
- **Built by:** `tools/build-world.mjs` and `tools/build-usa.mjs`

Simplified to about 2 km of detail and stored in longitude and latitude, not
projected, so the same shapes can be drawn at world scale or zoomed into one
continent.
