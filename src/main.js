/**
 * App shell: picks a set, shows the menu, starts a mode, shows the summary.
 *
 * Screens are plain functions that render into #app. There is no router and no
 * framework — a mode is started, and when it finishes it hands back a result.
 */

import {
  SETS,
  flagUrl,
  groupsOf,
  inGroup,
  loadEntries,
  loadMap,
  setById,
} from './data/sets.js';
import { modes } from './modes/index.js';
import { CHOICE_COUNTS, PAIR_COUNTS, getSettings, updateSettings } from './settings.js';
import { el, render } from './ui/dom.js';

const app = document.querySelector('#app');
let active = null;

/** Swap screens, tearing down a running mode first. */
function show(children) {
  active?.destroy?.();
  active = null;
  render(app, children);
}

/** The current set, its places, and the group in play. */
async function context() {
  const settings = getSettings();
  const set = setById(settings.set);
  const entries = await loadEntries(set);
  return { settings, set, entries, pool: inGroup(entries, settings.group) };
}

async function menu() {
  const { settings, set, entries, pool } = await context();

  show([
    el('header.masthead', [
      el('h1', 'Flag Game'),
      el('p.tagline', 'Learn the flags, names, and places of the world.'),
    ]),

    el(
      'ul.modes',
      modes.map((mode) =>
        el('li', [
          el('button.mode', { type: 'button', onclick: () => play(mode) }, [
            el('span.mode-title', mode.title),
            el('span.mode-desc', mode.describe(set)),
          ]),
        ]),
      ),
    ),

    settingsPanel(settings, set, entries),
    el('p.pool-note', `${pool.length} ${set.plural} in play.`),
  ]);
}

function settingsPanel(settings, set, entries) {
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

    chooser(
      'What to learn',
      SETS.map((s) => s.id),
      settings.set,
      (id) => updateSettings({ set: id }),
      (id) => setById(id).title,
    ),

    chooser(set.groupLabel, groupsOf(entries), settings.group, (group) =>
      updateSettings({ group }),
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

    chooser('Pairs to match', PAIR_COUNTS, settings.pairCount, (pairCount) =>
      updateSettings({ pairCount }),
    ),
  ]);
}

async function play(mode) {
  const { settings, set, pool } = await context();

  show(el('main.game', el('p.loading', 'Getting things ready…')));
  const root = app.querySelector('.game');

  // Only the map modes load the map, and only the first time one is played.
  let map = null;
  if (mode.needsMap) {
    try {
      map = await loadMap(set);
    } catch (error) {
      console.error(error);
      render(
        root,
        el('p.result.wrong', 'The map could not be loaded.'),
        el('button.next', { type: 'button', onclick: menu }, 'Back to the menu'),
      );
      return;
    }
  }

  render(root);
  active = mode.start({
    root,
    set,
    settings,
    pool,
    map,
    // A chosen group zooms the map to it, which is what makes the small places
    // in it clickable at all.
    view: map?.views[settings.group] ?? map?.views.All,
    onFinish: (result) => summary(mode, set, result),
  });
}

/**
 * The end of a round. Modes supply their own wording, because they do not all
 * end the same way — a streak ends on a miss, not after ten questions.
 */
function summary(mode, set, { headline, tagline, misses }) {
  show([
    el('header.masthead', [el('h1', headline), el('p.tagline', tagline)]),

    misses.length
      ? el('section.review', [
          el('h2', 'Worth another look'),
          el(
            'ul.review-list',
            misses.map((entry) =>
              el('li.review-item', [
                el('img.review-flag', {
                  src: flagUrl(set, entry), alt: '', width: 64, height: 48,
                }),
                el('span.review-name', entry.name),
                entry.capital ? el('span.review-capital', entry.capital) : null,
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
  await menu();
} catch (error) {
  render(
    app,
    el('div.error', [
      el('h1', 'The game could not load'),
      el('p', 'The game data is missing or unreadable.'),
      el(
        'p.hint',
        'If you opened this file directly, serve the folder instead: run ' +
          '"python3 -m http.server 8000" in the project and open localhost:8000.',
      ),
    ]),
  );
  console.error(error);
}
