/**
 * Loading and querying the country data set.
 *
 * `data/countries.json` is the single source of truth. Nothing else in the code
 * should contain a country name, code, or list.
 */

let cache = null;

/** All countries, loaded once. */
export async function loadCountries() {
  if (!cache) {
    const response = await fetch('data/countries.json');
    if (!response.ok) {
      throw new Error(`Could not load country data (HTTP ${response.status})`);
    }
    cache = await response.json();
  }
  return cache;
}

/** Countries in a region, or all of them for 'All'. */
export const inRegion = (countries, region) =>
  region === 'All' ? countries : countries.filter((c) => c.region === region);

/** Path to a country's flag. */
export const flagUrl = (country) => `assets/flags/${country.iso2}.svg`;
