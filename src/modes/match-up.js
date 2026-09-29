/**
 * Match mode — pair each flag with the place it belongs to.
 *
 * Tap a flag, then tap a place. Not drag and drop: dragging does not work on
 * touch without rebuilding it on pointer events, it is hostile to a keyboard,
 * and it is fiddly for small hands on a phone. Tapping twice is the same two
 * gestures a drag is made of, and works everywhere.
 *
 * Each place card shows its outline and its name, so the pairing tested is flag
 * to name while the shape is learned alongside it.
 */

import { sample, shuffled } from '../lib/random.js';
import { flagUrl } from '../data/sets.js';
import { shapeSvg } from '../ui/shape.js';
import { el, render } from '../ui/dom.js';

export default {
  id: 'match-up',
  title: 'Match them up',
  describe: (set) => `Pair each flag with its ${set.noun}.`,
  options: () => ['pairCount'],
  needsMap: true,

  start({ root, set, settings, pool, map, onFinish }) {
    const askable = pool.filter((entry) => map.shapes[entry.code]);
    const pairs = sample(askable, Math.min(settings.pairCount, askable.length));

    const matched = new Set();
    const wrongTries = [];
    let picked = null;

    const progress = el('p.progress');
    const flagColumn = el('ul.match-column.flags');
    const placeColumn = el('ul.match-column.places');
    const feedback = el('div.feedback', { role: 'status', 'aria-live': 'polite' });

    render(
      root,
      el('div.question.match-question', [
        progress,
        el('h2.prompt', `Tap a flag, then tap its ${set.noun}.`),
        el('div.match-board', [flagColumn, placeColumn]),
        feedback,
      ]),
    );

    const showProgress = () => {
      progress.textContent = `${matched.size} of ${pairs.length} paired`;
    };

    /** The two columns are shuffled apart, or the answer is the row opposite. */
    const flagOrder = shuffled(pairs);
    const placeOrder = shuffled(pairs);

    function draw() {
      showProgress();

      render(
        flagColumn,
        flagOrder.map((entry) =>
          el('li', [
            el(
              'button.match-card.flag-card',
              {
                type: 'button',
                'aria-pressed': String(picked?.code === entry.code),
                'aria-label': `Flag ${flagOrder.indexOf(entry) + 1}`,
                disabled: matched.has(entry.code),
                onclick: () => choose(entry),
              },
              el('img.match-flag', { src: flagUrl(set, entry), alt: '' }),
            ),
          ]),
        ),
      );

      render(
        placeColumn,
        placeOrder.map((entry) =>
          el('li', [
            el(
              'button.match-card.place-card',
              {
                type: 'button',
                disabled: matched.has(entry.code),
                onclick: () => tryPair(entry),
              },
              [
                shapeSvg(map.shapes[entry.code], {
                  size: 120,
                  label: `Outline of ${entry.name}`,
                }),
                el('span.match-name', entry.name),
              ],
            ),
          ]),
        ),
      );
    }

    function choose(entry) {
      // Tapping the chosen flag again puts it back down.
      picked = picked?.code === entry.code ? null : entry;
      render(feedback, picked ? el('p.hint', `Now tap the ${set.noun} it belongs to.`) : null);
      draw();
    }

    function tryPair(entry) {
      if (!picked) {
        render(feedback, el('p.hint', 'Tap a flag first.'));
        return;
      }

      if (picked.code === entry.code) {
        matched.add(entry.code);
        const done = matched.size === pairs.length;
        picked = null;
        draw();
        render(
          feedback,
          el('p.result.correct', [
            el('span.mark', { 'aria-hidden': 'true' }, '✓'),
            el('span', `Yes — that flag is ${entry.name}.`),
          ]),
          done
            ? el('button.next', { type: 'button', onclick: finish }, 'See how you did')
            : null,
        );
        if (done) feedback.querySelector('.next').focus();
        return;
      }

      // A wrong pairing costs nothing, but each flag that took more than one go
      // is remembered once, so the round can say how many went straight in.
      if (!wrongTries.some((e) => e.code === picked.code)) wrongTries.push(picked);
      const missed = picked;
      picked = null;
      draw();
      render(
        feedback,
        el('p.result.wrong', [
          el('span.mark', { 'aria-hidden': 'true' }, '→'),
          el('span', `That flag isn't ${entry.name}. Try it against another one.`),
        ]),
      );
      void missed;
    }

    function finish() {
      const clean = pairs.length - wrongTries.length;
      // No `misses`, so the summary shows no review list. A round here only ends
      // once every pair is made, so the flags are all matched by the time it is
      // over and showing them again teaches nothing. The count still counts.
      onFinish({
        headline: wrongTries.length ? 'All paired up' : 'Perfect round',
        tagline: wrongTries.length
          ? `You paired all ${pairs.length}, ${clean} of them first time.`
          : `All ${pairs.length} paired, every one first time.`,
      });
    }

    draw();
    return { destroy: () => render(root) };
  },
};
