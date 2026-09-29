/**
 * App shell: loads the data, shows the menu, starts a mode, shows the summary.
 *
 * Screens are plain functions that render into #app. There is no router and no
 * framework — a mode is started, and when it finishes it hands back a result.
 */

import { loadCountries, inRegion } from './data/countries.js';
import { modes } from './modes/index.js';
import {
  CHOICE_COUNTS,
  REGIONS,
  getSettings,
  updateSettings,
} from './settings.js';
import { el, render } from './ui/dom.js';

const app = document.querySelector('#app');
let countries = [];
let active = null;

/** Swap screens, tearing down a running mode first. */
function show(children) {
  active?.destroy?.();
  active = null;
  render(app, children);
}

function menu() {
  const settings = getSettings();
  const playable = inRegion(countries, settings.region);

  show([
    el('header.masthead', [
      el('h1', 'Flag Game'),
      el('p.tagline', 'Learn the flags, names, and places of the world.'),
    ]),

    el(
      'ul.modes',
      modes.map((mode) =>
        el('li', [
          el(
            'button.mode',
            { type: 'button', onclick: () => play(mode) },
            [el('span.mode-title', mode.title), el('span.mode-desc', mode.description)],
          ),
        ]),
      ),
    ),

    settingsPanel(),
    el('p.pool-note', `${playable.length} countries in play.`),
  ]);
}

function settingsPanel() {
  const settings = getSettings();

  /** A labelled row of buttons, one of which is on. */
  const chooser = (label, values, selected, onPick, format = String) =>
    el('div.setting', [
      el('span.setting-label', label),
      el(
        'div.setting-options',
        values.map((value) =>
          el(
            'button.option',
            {
              type: 'button',
              'aria-pressed': String(value === selected),
              onclick: () => {
                onPick(value);
                menu();
              },
            },
            format(value),
          ),
        ),
      ),
    ]);

  return el('section.settings', [
    el('h2', 'Settings'),
    chooser('Part of the world', REGIONS, settings.region, (region) =>
      updateSettings({ region }),
    ),
    chooser(
      'How to answer',
      ['choices', 'typed'],
      settings.answerStyle,
      (answerStyle) => updateSettings({ answerStyle }),
      (style) => (style === 'typed' ? 'Type the name' : 'Pick from a list'),
    ),
    settings.answerStyle === 'choices'
      ? chooser('Number of choices', CHOICE_COUNTS, settings.choiceCount, (choiceCount) =>
          updateSettings({ choiceCount }),
        )
      : null,
    chooser('Questions per round', [5, 10, 20], settings.questionsPerRound, (n) =>
      updateSettings({ questionsPerRound: n }),
    ),
  ]);
}

function play(mode) {
  const settings = getSettings();
  const pool = inRegion(countries, settings.region);

  show(el('main.game'));
  active = mode.start({
    root: app.querySelector('.game'),
    settings,
    pool,
    onFinish: (result) => summary(mode, result),
  });
}

function summary(mode, { score, total, misses }) {
  show([
    el('header.masthead', [
      el('h1', 'Round finished'),
      el('p.tagline', `You got ${score} of ${total} right.`),
    ]),

    misses.length
      ? el('section.review', [
          el('h2', 'Worth another look'),
          el(
            'ul.review-list',
            misses.map((country) =>
              el('li.review-item', [
                el('img.review-flag', {
                  src: `assets/flags/${country.iso2}.svg`,
                  alt: '',
                  width: 64,
                  height: 48,
                }),
                el('span', country.name),
              ]),
            ),
          ),
        ])
      : el('p.perfect', 'Every one correct.'),

    el('div.actions', [
      el('button.primary', { type: 'button', onclick: () => play(mode) }, 'Play again'),
      el('button.secondary', { type: 'button', onclick: menu }, 'Back to the menu'),
    ]),
  ]);
}

try {
  countries = await loadCountries();
  menu();
} catch (error) {
  render(
    app,
    el('div.error', [
      el('h1', 'The game could not load'),
      el('p', 'The country data is missing or unreadable.'),
      el(
        'p.hint',
        'If you opened this file directly, serve the folder instead: run ' +
          '"python3 -m http.server 8000" in the project and open localhost:8000.',
      ),
    ]),
  );
  console.error(error);
}
