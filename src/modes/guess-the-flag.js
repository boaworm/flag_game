/**
 * Mode 1 — Guess the flag.
 *
 * A flag is shown; the player either picks the place from a set of choices or
 * types its name. Which one is a setting, not a separate mode.
 */

import { createRound } from '../lib/quiz.js';
import { matchesName } from '../lib/text.js';
import { flagUrl } from '../data/sets.js';
import { el, render } from '../ui/dom.js';

export default {
  id: 'guess-the-flag',
  title: 'Guess the flag',
  describe: (set) => `See a flag, name the ${set.noun}.`,

  start({ root, set, settings, pool, onFinish }) {
    const round = createRound({ pool, length: settings.questionsPerRound });

    const flag = el('img.flag', { alt: '', width: 320, height: 240 });
    const answers = el('div.answers');
    const feedback = el('div.feedback', { role: 'status', 'aria-live': 'polite' });
    const progress = el('p.progress');

    render(
      root,
      el('div.question', [
        progress,
        el('h2.prompt', `Which ${set.noun} has this flag?`),
        el('div.flag-frame', flag),
        answers,
        feedback,
      ]),
    );

    // Captured when asked: after answering, the round has moved on, but the
    // player is still looking at the question they just answered.
    let asking = 1;
    const showProgress = () => {
      progress.textContent =
        `Question ${asking} of ${round.total} · ${round.score} right so far`;
    };

    function ask() {
      const entry = round.current;
      asking = round.number;
      showProgress();
      flag.src = flagUrl(set, entry);
      render(feedback);
      render(
        answers,
        settings.answerStyle === 'typed' ? typedAnswer(entry) : choiceAnswers(entry),
      );
    }

    function choiceAnswers(entry) {
      return round.options(settings.choiceCount).map((option) =>
        el(
          'button.choice',
          { type: 'button', onclick: () => resolve(option.code === entry.code, entry) },
          option.name,
        ),
      );
    }

    function typedAnswer(entry) {
      const input = el('input.typed', {
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: false,
        placeholder: `Type the ${set.noun}`,
        'aria-label': `${set.noun} name`,
      });

      const form = el(
        'form.typed-form',
        {
          onsubmit: (event) => {
            event.preventDefault();
            const { correct, matched, exact } = matchesName(input.value, entry.acceptedNames);
            resolve(correct, entry, correct && !exact ? matched : null);
          },
        },
        [input, el('button.submit', { type: 'submit' }, 'Check')],
      );

      requestAnimationFrame(() => input.focus());
      return form;
    }

    /**
     * Show the outcome and wait. A wrong answer is told the right one and costs
     * nothing but the point — no penalty, no timer, no failure framing.
     */
    function resolve(wasCorrect, entry, nearMiss = null) {
      for (const control of answers.querySelectorAll('button, input')) control.disabled = true;

      const message = wasCorrect
        ? nearMiss
          ? `Yes — that's ${entry.name}. It's spelled "${nearMiss}".`
          : `Yes — that's ${entry.name}.`
        : `That one is ${entry.name}.`;

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
          round.finished ? 'See how you did' : 'Next flag',
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
