/**
 * Mode 1 — Guess the flag.
 *
 * A flag is shown; the player either picks the country from a set of choices or
 * types its name. Which one is a setting, not a separate mode.
 */

import { createRound } from '../lib/quiz.js';
import { matchesName } from '../lib/text.js';
import { flagUrl } from '../data/countries.js';
import { el, render } from '../ui/dom.js';

export default {
  id: 'guess-the-flag',
  title: 'Guess the flag',
  description: 'See a flag, name the country.',

  start({ root, settings, pool, onFinish }) {
    const round = createRound({ pool, length: settings.questionsPerRound });

    const flag = el('img.flag', { alt: '', width: 320, height: 240 });
    const answers = el('div.answers');
    const feedback = el('div.feedback', { role: 'status', 'aria-live': 'polite' });
    const progress = el('p.progress');

    render(
      root,
      el('div.question', [
        progress,
        el('h2.prompt', 'Which country has this flag?'),
        el('div.flag-frame', flag),
        answers,
        feedback,
      ]),
    );

    /** Move to the next question, or end the round. */
    function next() {
      if (round.finished) {
        onFinish({ score: round.score, total: round.total, misses: round.misses });
        return;
      }
      ask();
    }

    // The question number is captured when asked: after answering, the round has
    // already advanced, but the player is still looking at the question they just
    // answered — and the score beside it has to be the updated one.
    let asking = 1;

    function showProgress() {
      progress.textContent =
        `Question ${asking} of ${round.total} · ${round.score} right so far`;
    }

    function ask() {
      const country = round.current;
      asking = round.number;
      showProgress();
      flag.src = flagUrl(country);
      render(feedback);

      render(
        answers,
        settings.answerStyle === 'typed' ? typedAnswer(country) : choiceAnswers(country),
      );
    }

    function choiceAnswers(country) {
      return round.options(settings.choiceCount).map((option) =>
        el(
          'button.choice',
          {
            type: 'button',
            onclick: () => resolve(option.iso2 === country.iso2, country),
          },
          option.name,
        ),
      );
    }

    function typedAnswer(country) {
      const input = el('input.typed', {
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: false,
        placeholder: 'Type the country',
        'aria-label': 'Country name',
      });

      const form = el(
        'form.typed-form',
        {
          onsubmit: (event) => {
            event.preventDefault();
            const { correct, matched, exact } = matchesName(
              input.value,
              country.acceptedNames,
            );
            resolve(correct, country, correct && !exact ? matched : null);
          },
        },
        [input, el('button.submit', { type: 'submit' }, 'Check')],
      );

      // Focus after the screen is in the document, so the keyboard opens on tablets.
      requestAnimationFrame(() => input.focus());
      return form;
    }

    /**
     * Show the outcome and wait. A wrong answer is told the right one and costs
     * nothing but the point — no penalty, no timer, no failure framing.
     */
    function resolve(wasCorrect, country, nearMiss = null) {
      for (const button of answers.querySelectorAll('button, input')) {
        button.disabled = true;
      }

      const message = wasCorrect
        ? nearMiss
          ? `Yes — that's ${country.name}. It's spelled "${nearMiss}".`
          : `Yes — that's ${country.name}.`
        : `That one is ${country.name}.`;

      round.answer(wasCorrect);
      showProgress();

      render(
        feedback,
        el(wasCorrect ? 'p.result.correct' : 'p.result.wrong', [
          // Paired with text, never colour alone.
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

    ask();
    return { destroy: () => render(root) };
  },
};
