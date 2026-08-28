import './Landing.css';
import { useEffect, useState } from 'react';
import { AnimatedNumber } from './motion-primitives/AnimatedNumber';
import { InfiniteSlider } from './motion-primitives/InfiniteSlider';
import { LANDING_TEASERS, TOPICS } from '../data/questions';
import type { KeyboardEvent } from 'react';
import type { QuizActions, QuizState } from '../types';

const TEASER_ROTATE_MS = 8000;
// Temporary local value until quiz-play analytics are read from the database.
const QUIZZES_PLAYED = 271;

interface LandingProps {
  state: QuizState;
  actions: QuizActions;
}

export default function Landing({ state, actions }: LandingProps) {
  const { other } = state;
  const [teaserIndex, setTeaserIndex] = useState(() => Math.floor(Math.random() * LANDING_TEASERS.length));

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      setTeaserIndex((i) => (i + 1) % LANDING_TEASERS.length);
    }, TEASER_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const onOtherKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') actions.startQuiz();
  };

  return (
    <div className="landing">
      <h1 className="landing__hero">A better question changes the room.</h1>
      <div className="rule" />
      <p className="landing__sub">
        Pick a subject. We&rsquo;ll make ten worth asking, each one checked against a real source.
      </p>

      <p key={teaserIndex} className="landing__ticker">{LANDING_TEASERS[teaserIndex]}</p>

      <div className="landing__surprise">
        <button
          className="btn btn--forest landing__surprise-button"
          onClick={actions.randomQuiz}
          disabled={state.randomLoading}
        >
          <span>{state.randomLoading ? 'Picking from the archive…' : 'Surprise me with 10 questions'}</span>
          <span className="btn__arrow" aria-hidden="true">&rarr;</span>
        </button>
        <p className="landing__play-count" aria-label={`${QUIZZES_PLAYED} quizzes played so far`}>
          <AnimatedNumber
            className="landing__play-count-number"
            springOptions={{ bounce: 0, duration: 1800 }}
            value={QUIZZES_PLAYED}
          />
          <span>quizzes played so far</span>
        </p>
        {state.randomError && (
          <p className="landing__surprise-error" role="alert">{state.randomError}</p>
        )}
      </div>

      <div className="section-heading">
        <span className="section-label section-label--muted">CHOOSE A SUBJECT</span>
        <span className="section-heading__rule" />
      </div>

      <div className="topics-reel">
        <InfiniteSlider
          className="topics-reel__slider"
          gap={12}
          speed={34}
          speedOnHover={0}
          reverse
          ariaLabel="Quiz subjects"
        >
          {TOPICS.map((topic) => (
            <button
              key={topic.name}
              type="button"
              className="topic-ticket"
              onClick={() => actions.pickTopic(topic.name)}
              disabled={state.randomLoading}
            >
              <span className="topic-ticket__tab" style={{ background: topic.tab }} aria-hidden="true" />
              <span className="topic-ticket__name">{topic.name}</span>
              <span className="topic-ticket__meta">
                <span>{topic.count === 'NEW' ? 'New set' : `${topic.count} questions`}</span>
                <span className="topic-ticket__arrow" aria-hidden="true">&rarr;</span>
              </span>
            </button>
          ))}
        </InfiniteSlider>
      </div>

      <div className="other-topic">
        <input
          value={other}
          onChange={(e) => actions.setOther(e.target.value)}
          onKeyDown={onOtherKeyDown}
          placeholder="Other topic"
          className="other-topic__input"
        />
        <button className="other-topic__submit" onClick={actions.startQuiz}>
          Make my quiz
        </button>
      </div>

      <p className="landing__footnote">Two questions. No score, no timer. Just the pleasure of working one out.</p>
    </div>
  );
}
