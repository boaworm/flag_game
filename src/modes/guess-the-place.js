/**
 * Mode 2 — Guess the flag of a place.
 *
 * The reverse of mode 1: a name is shown and the player picks its flag from
 * several. Recognising a flag among others is a different skill from recalling
 * one, so both directions are worth asking.
 */

import { createRound } from '../lib/quiz.js';
import { flagUrl } from '../data/sets.js';
import { el, render } from '../ui/dom.js';

export default {
  id: 'guess-the-place',
  title: 'Find the flag',
  describe: (set) => `See a ${set.noun}, pick its flag.`,
  options: () => ['choiceCount', 'questionsPerRound'],

  start({ root, set, settings, pool, onFinish }) {
    const round = createRound({ pool, length: settings.questionsPerRound });

    const prompt = el('h2.prompt');
    const answers = el('div.flag-choices');
    const feedback = el('div.feedback', { role: 'status', 'aria-live': 'polite' });
    const progress = el('p.progress');

    render(root, el('div.question', [progress, prompt, answers, feedback]));

    let asking = 1;
    const showProgress = () => {
      progress.textContent =
        `Question ${asking} of ${round.total} · ${round.score} right so far`;
    };

    function ask() {
      const entry = round.current;
      asking = round.number;
      showProgress();
      prompt.textContent = `Which flag belongs to ${entry.name}?`;
      render(feedback);

      render(
        answers,
        round.options(settings.choiceCount).map((option) =>
          el(
            'button.flag-choice',
            {
              type: 'button',
              // The name is the answer, so the button is labelled by position.
              'aria-label': `Flag option`,
              onclick: () => resolve(option.code === entry.code, entry, option),
            },
            el('img.choice-flag', { src: flagUrl(set, option), alt: '' }),
          ),
        ),
      );
    }

    function resolve(wasCorrect, entry, chosen) {
      for (const button of answers.querySelectorAll('button')) button.disabled = true;

      const message = wasCorrect
        ? `Yes — that's the flag of ${entry.name}.`
        : `That one is ${chosen.name}. ${entry.name}'s flag is the highlighted one.`;

      if (!wasCorrect) {
        // Point at the right flag rather than only saying it was wrong.
        const buttons = [...answers.querySelectorAll('button')];
        const options = [...answers.querySelectorAll('img')];
        const index = options.findIndex((img) => img.src.endsWith(`/${entry.code}.svg`));
        if (index >= 0) buttons[index].classList.add('is-answer');
      }

      round.answer(wasCorrect);
      showProgress();

      render(
        feedback,
        el(wasCorrect ? 'p.result.correct' : 'p.result.wrong', [
          el('span.mark', { 'aria-hidden': 'true' }, wasCorrect ? '✓' : '→'),
          el('span', message),
        ]),
        el(
          'button.next',
          { type: 'button', onclick: next },
          round.finished ? 'See how you did' : 'Next one',
        ),
      );
      feedback.querySelector('.next').focus();
    }

    function next() {
      if (round.finished) {
        onFinish({
          headline: 'Round finished',
          tagline: `You got ${round.score} of ${round.total} right.`,
          misses: round.misses,
        });
        return;
      }
      ask();
    }

    ask();
    return { destroy: () => render(root) };
  },
};
