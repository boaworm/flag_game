/**
 * Mode 4 — Point to the place.
 *
 * A place is named; the player clicks where they think it is on a map that shows
 * only an outline. A hit fills the place in. A miss fills it in too, and says how
 * far away the click was — the distance is the lesson, so a wrong answer still
 * teaches where the place actually is.
 */

import { createRound } from '../lib/quiz.js';
import { describeDistance, isHit, missDistanceKm } from '../lib/geo.js';
import { createMap, flagChip } from '../ui/map.js';
import { flagUrl } from '../data/sets.js';
import { el, render } from '../ui/dom.js';

export default {
  id: 'point-to-country',
  title: 'Point to it on the map',
  describe: (set) => `Click where a ${set.noun} is on the map.`,
  needsMap: true,

  start({ root, set, settings, pool, map, view, onFinish }) {
    // Only places the map can draw can be asked about.
    const askable = pool.filter((entry) => map.shapes[entry.code]);
    const round = createRound({ pool: askable, length: settings.questionsPerRound });

    const progress = el('p.progress');
    const prompt = el('h2.prompt');
    const feedback = el('div.feedback', { role: 'status', 'aria-live': 'polite' });

    const world = createMap({
      map,
      view,
      onPick: guess,
      label:
        `Map. Click where you think the ${set.noun} is, or move the crosshair with the arrow keys and press Enter.`,
    });

    render(
      root,
      el('div.question.map-question', [
        progress,
        prompt,
        el('div.map-frame', world.element),
        feedback,
      ]),
    );

    let asking = 1;
    const showProgress = () => {
      progress.textContent =
        `Question ${asking} of ${round.total} · ${round.score} right so far`;
    };

    function ask() {
      const entry = round.current;
      asking = round.number;
      showProgress();
      render(prompt, flagChip(flagUrl(set, entry)), el('span', `Where is ${entry.name}?`));
      render(feedback);
      world.clear();
      world.setAccepting(true);
    }

    function guess({ point, coordinate }) {
      const entry = round.current;
      const shape = map.shapes[entry.code];
      const correct = isHit(coordinate, shape, world.projection, world.renderedWidth());

      world.setAccepting(false);
      world.reveal(shape, { correct });

      let message;
      if (correct) {
        message = `Yes — that's ${entry.name}.`;
      } else {
        const km = missDistanceKm(coordinate, shape);
        // The line points at the place's own label point, which is guaranteed to
        // be on land, rather than at the nearest bit of its border.
        world.markMiss(point, shape.point);
        message = `${entry.name} is here — about ${describeDistance(km)} from your guess.`;
      }

      round.answer(correct);
      showProgress();

      render(
        feedback,
        el(correct ? 'p.result.correct' : 'p.result.wrong', [
          el('span.mark', { 'aria-hidden': 'true' }, correct ? '✓' : '→'),
          el('span', message),
        ]),
        el(
          'button.next',
          { type: 'button', onclick: next },
          round.finished ? 'See how you did' : `Next ${set.noun}`,
        ),
      );
      feedback.querySelector('.next').focus();
    }

    function next() {
      if (round.finished) {
        onFinish({ score: round.score, total: round.total, misses: round.misses });
        return;
      }
      ask();
    }

    ask();
    return { destroy: () => render(root) };
  },
};
