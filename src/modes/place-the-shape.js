/**
 * Mode 3 — Place the shape, in two flavours.
 *
 * A place's outline is shown with no name, and the player clicks where on the
 * map it belongs. Correct answers stay on the board, so the map fills in as the
 * round goes on and each one makes the next a little easier to reason about.
 *
 * The streak flavour is the same activity with a different stopping rule: it
 * runs until the player misses. Both come from this one factory, so the two
 * cannot drift apart.
 */

import { createBag, createRound } from '../lib/quiz.js';
import { flagUrl } from '../data/sets.js';
import { describeDistance, isHit, missDistanceKm } from '../lib/geo.js';
import { read, write } from '../lib/storage.js';
import { createGlobeMap } from '../ui/globe.js';
import { flagChip } from '../ui/flag.js';
import { shapeSvg } from '../ui/shape.js';
import { el, render } from '../ui/dom.js';

const BEST_KEY = 'flag-game.best-streak';

export function createPlaceMode({ id, title, describe, streak = false }) {
  return {
    id,
    title,
    describe,
    needsMap: true,
    needs: ['outlines'],
    // A streak runs until a miss, so there is no round length to ask about —
    // and asking nothing is what lets it start straight away instead of showing
    // a setup screen, so the clue toggles go on the fixed round only.
    options: () => (streak ? [] : ['questionsPerRound', 'showFlag', 'showName']),

    start({ root, set, settings, pool, map, view, onFinish }) {
      const askable = pool.filter((entry) => map.shapes[entry.code]);

      // A fixed round, or an endless bag that only a miss brings to an end.
      const round = streak ? null : createRound({ pool: askable, length: settings.questionsPerRound });
      const bag = streak ? createBag(askable) : null;

      const bests = read(BEST_KEY, {});
      const bestKey = `${set.id}:${settings.group}`;
      let best = bests[bestKey] ?? 0;
      let run = 0;
      let current = null;

      const progress = el('p.progress');
      const shapeHolder = el('div.shape-frame');
      const clues = el('div.shape-clues');
      const feedback = el('div.feedback', { role: 'status', 'aria-live': 'polite' });

      const world = createGlobeMap({
        map,
        view,
        onPick: guess,
        label: `Globe. Click where you think this ${set.noun} belongs, or turn the globe with the arrow keys until the spot is under the crosshair and press Enter.`,
      });

      render(
        root,
        el('div.question.map-question', [
          progress,
          el('h2.prompt', `Where does this ${set.noun} go?`),
          el('div.place-layout', [
            el('div.shape-column', [shapeHolder, clues]),
            el('div.map-frame', world.element),
          ]),
          feedback,
        ]),
      );

      // The globe measures itself against its box, so it can only be set up
      // once it is in the document.
      world.mount();

      const showProgress = () => {
        progress.textContent = streak
          ? best
            ? `Streak: ${run} · your best is ${best}`
            : `Streak: ${run}`
          : `Question ${Math.min(round.number, round.total)} of ${round.total} · ${round.score} right so far`;
      };

      /**
       * The clues beside the shape, for a player who asked for them.
       *
       * The flag keeps `flagChip`'s empty alt: it is a picture standing in for
       * a name, so reading it out would make "show flag" into "show name" for
       * anyone listening rather than looking. Show name is the clue that says
       * something out loud.
       */
      function showClues() {
        const flag = settings.showFlag ? flagUrl(set, current) : null;
        render(
          clues,
          flag ? flagChip(flag) : null,
          settings.showName ? el('p.shape-name', current.name) : null,
        );
      }

      function ask() {
        current = streak ? bag.next() : round.current;
        showProgress();
        render(shapeHolder, shapeSvg(map.shapes[current.code], { size: 240 }));
        showClues();
        render(feedback);
        world.clear();
        world.setAccepting(true);
      }

      function guess({ coordinate }) {
        const shape = map.shapes[current.code];
        const correct = isHit(coordinate, shape);

        world.setAccepting(false);

        if (correct) {
          // It goes on the board and stays there.
          world.place(shape);
          run += 1;
        } else {
          world.reveal(shape, { correct: false });
          world.markMiss(coordinate, shape.point);
        }

        if (streak) {
          if (correct) {
            if (run > best) {
              best = run;
              write(BEST_KEY, { ...bests, [bestKey]: best });
            }
          }
        } else {
          round.answer(correct);
        }
        showProgress();

        const message = correct
          ? `Yes — that's ${current.name}.`
          : `That's ${current.name} — about ${describeDistance(missDistanceKm(coordinate, shape))} from where you clicked.`;

        // In streak play a miss ends the run, so there is nothing to click on to.
        const done = streak ? !correct : round.finished;

        render(
          feedback,
          el(correct ? 'p.result.correct' : 'p.result.wrong', [
            el('span.mark', { 'aria-hidden': 'true' }, correct ? '✓' : '→'),
            el('span', message),
          ]),
          el(
            'button.next',
            { type: 'button', onclick: () => (done ? finish() : ask()) },
            done ? 'See how you did' : `Next ${set.noun}`,
          ),
        );
        feedback.querySelector('.next').focus();
      }

      function finish() {
        if (streak) {
          onFinish({
            headline: run === best && run > 0 ? 'A new best' : 'Streak over',
            tagline:
              run === 0
                ? `Not this time — ${current.name} was the first one. Your best is ${best}.`
                : `You placed ${run} in a row. Your best is ${best}.`,
            misses: [current],
          });
          return;
        }
        onFinish({
          headline: 'Round finished',
          tagline: `You got ${round.score} of ${round.total} right.`,
          misses: round.misses,
        });
      }

      ask();
      return {
        destroy: () => {
          world.destroy();
          render(root);
        },
      };
    },
  };
}

export const placeTheShape = createPlaceMode({
  id: 'place-the-shape',
  title: 'Place the shape',
  describe: (set) => `See a ${set.noun}'s outline, put it on the map.`,
});

export const shapeStreak = createPlaceMode({
  id: 'shape-streak',
  title: 'Streak',
  describe: (set) => `Place ${set.plural} one after another. How far can you get?`,
  streak: true,
});
