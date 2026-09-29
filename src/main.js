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
  isDivided,
  loadEntries,
  loadMap,
  setById,
  setSuits,
} from './data/sets.js';
import { modes } from './modes/index.js';
import {
  CHOICE_COUNTS,
  PAIR_COUNTS,
  ROUND_LENGTHS,
  getSettings,
  updateSettings,
} from './settings.js';
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
          el('button.mode', { type: 'button', onclick: () => setup(mode) }, [
            el('span.mode-title', mode.title),
            el('span.mode-desc', mode.describe(set)),
          ]),
        ]),
      ),
    ),

    el('p.pool-note', `${set.title} · ${inGroup(entries, settings.group).length} ${set.plural} in play.`),
  ]);
}

/** A labelled row of buttons, one of which is on. */
function chooser({ name, label, values, selected, format = String, onPick }) {
  return el('div.setting', [
    el('span.setting-label', label),
    el(
      'div.setting-options',
      values.map((value) =>
        el(
          'button.option',
          {
            type: 'button',
            'aria-pressed': String(value === selected),
            // Named so that picking one can hand focus back to it afterwards.
            'data-setting': name,
            'data-value': String(value),
            onclick: () => onPick(value),
          },
          format(value),
        ),
      ),
    ),
  ]);
}

/**
 * The choices offered before a mode starts.
 *
 * Every mode asks what is being learned and which part of it; a mode adds
 * whatever else it reads. This decides how each row is shown, so no screen has
 * to know about any particular mode — the same reason modes are written against
 * a set rather than against countries.
 */
const SETTING_ROWS = {
  set: {
    label: () => 'What to learn',
    // Only the sets this mode can actually be played with. Ancient Greece has no
    // flags, so it is not offered to a mode that shows one.
    values: ({ mode }) => SETS.filter((s) => setSuits(s, mode)).map((s) => s.id),
    format: (id) => setById(id).title,
  },
  group: {
    label: ({ set }) => set.groupLabel,
    values: ({ entries }) => groupsOf(entries),
  },
  answerStyle: {
    label: () => 'How to answer',
    values: () => ['choices', 'typed'],
    format: (style) => (style === 'typed' ? 'Type the name' : 'Pick from a list'),
  },
  choiceCount: {
    label: () => 'How many to choose from',
    values: () => CHOICE_COUNTS,
  },
  pairCount: {
    label: () => 'How many pairs',
    values: () => PAIR_COUNTS,
  },
  questionsPerRound: {
    label: ({ set }) => `How many ${set.plural}`,
    // Never offer a longer round than there are places to fill it with.
    values: ({ pool }) => [...ROUND_LENGTHS.filter((n) => n < pool.length), pool.length],
    format: (n, { pool }) => (n === pool.length ? `All ${n}` : String(n)),
  },
};

/** Every setup screen starts with what is being learned. */
const ALWAYS_ASKED = ['set', 'group'];

/**
 * Before a mode starts: what it wants to know, and a button to begin.
 *
 * A mode that asks nothing — the streak, which runs until a miss — starts
 * straight away rather than showing an empty screen.
 */
async function setup(mode, focusOn = null) {
  let { settings, set, entries, pool } = await context();

  // The set in play may be one this mode cannot use — Ancient Greece has no
  // flags to guess. Move to one it can rather than offering an impossible game.
  if (!setSuits(set, mode)) {
    updateSettings({ set: SETS.find((s) => setSuits(s, mode)).id });
    ({ settings, set, entries, pool } = await context());
  }

  // A set that is not divided up is not asked which part of it to play.
  if (!isDivided(set) && settings.group !== 'All') {
    updateSettings({ group: 'All' });
    ({ settings, set, entries, pool } = await context());
  }

  const keys = [...ALWAYS_ASKED, ...mode.options(settings)]
    .filter((key) => key !== 'group' || isDivided(set));
  const where = { set, entries, pool, mode };

  // A round carried over from a bigger group can outlast a smaller one.
  if (keys.includes('questionsPerRound') && settings.questionsPerRound > pool.length) {
    updateSettings({ questionsPerRound: pool.length });
    return setup(mode, focusOn);
  }

  show([
    el('header.masthead', [el('h1', mode.title), el('p.tagline', mode.describe(set))]),

    el(
      'section.settings',
      keys.map((key) => {
        const row = SETTING_ROWS[key];
        return chooser({
          name: key,
          label: row.label(where),
          values: row.values(where),
          selected: settings[key],
          format: (value) => (row.format ? row.format(value, where) : String(value)),
          onPick: (value) => {
            updateSettings({ [key]: value });
            setup(mode, [key, value]);
          },
        });
      }),
    ),

    el('p.pool-note', `${pool.length} ${set.plural} in play.`),

    el('div.actions', [
      el('button.primary', { type: 'button', onclick: () => play(mode) }, 'Start'),
      el('button.secondary', { type: 'button', onclick: menu }, 'Back'),
    ]),
  ]);

  // Picking an option redraws the screen, so put focus back where it was.
  if (focusOn) {
    const [key, value] = focusOn;
    app
      .querySelector(`[data-setting="${key}"][data-value="${CSS.escape(String(value))}"]`)
      ?.focus();
  }
}

async function play(mode) {
  const { settings, set, pool } = await context();

  /**
   * A way out of a round in progress.
   *
   * It sits beside what the mode draws rather than inside it, so a mode can
   * replace its own contents as often as it likes without taking the exit with
   * it. Leaving mid-round costs nothing and asks nothing: there is no score to
   * lose and no question worth a confirmation box.
   */
  const root = el('div.game-root', el('p.loading', 'Getting things ready…'));
  show(
    el('main.game', [
      el(
        'div.game-bar',
        el('button.leave', { type: 'button', onclick: menu }, '\u2190 Menu'),
      ),
      root,
    ]),
  );

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
 *
 * A mode that hands back no `misses` at all gets no review list. That is not the
 * same as handing back an empty one, which means a clean round and is worth
 * saying so: match mode ends with everything paired whatever happened on the
 * way, so naming what took two goes is noise rather than a lesson.
 */
function summary(mode, set, { headline, tagline, misses }) {
  show([
    el('header.masthead', [el('h1', headline), el('p.tagline', tagline)]),

    !misses
      ? null
      : misses.length
      ? el('section.review', [
          el('h2', 'Worth another look'),
          el(
            'ul.review-list',
            misses.map((entry) =>
              el('li.review-item', [
                flagUrl(set, entry)
                  ? el('img.review-flag', {
                    src: flagUrl(set, entry), alt: '', width: 64, height: 48,
                  })
                  : null,
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
