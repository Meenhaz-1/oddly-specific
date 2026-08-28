import './Landing.css';
import { AnimatedNumber } from './motion-primitives/AnimatedNumber';
import { InfiniteSlider } from './motion-primitives/InfiniteSlider';
import { GENERATED_QUESTION_COUNT, MAX_TOPIC_CHARACTERS } from '../constants';
import { TOPICS } from '../data/questions';
import type { KeyboardEvent } from 'react';
import type { QuizActions, QuizState } from '../types';

// Temporary local value until quiz-play analytics are read from the database.
const QUIZZES_PLAYED = 271;

interface LandingProps {
  state: QuizState;
  actions: QuizActions;
}

export default function Landing({ state, actions }: LandingProps) {
  const { other } = state;

  const onOtherKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') actions.startQuiz();
  };

  return (
    <div className="landing">
      <h1 className="landing__hero">Make a quiz on any topic.</h1>
      <div className="rule" />
      <p className="landing__sub">
        Get two open-ended questions, checked against real sources.
      </p>

      <div className="section-heading">
        <span className="section-label section-label--muted">PICK A SUBJECT</span>
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
                <span>{GENERATED_QUESTION_COUNT} questions</span>
                <span className="topic-ticket__arrow" aria-hidden="true">&rarr;</span>
              </span>
            </button>
          ))}
        </InfiniteSlider>
      </div>

      <div className="landing__surprise">
        <button
          type="button"
          className="btn btn--forest landing__surprise-button"
          onClick={actions.randomQuiz}
          disabled={state.randomLoading}
          aria-busy={state.randomLoading}
        >
          <span>{state.randomLoading ? 'Picking from the archive...' : 'Surprise me with 10 questions'}</span>
          <span className="btn__arrow" aria-hidden="true">&rarr;</span>
        </button>
        {state.randomError && (
          <p className="landing__surprise-error" role="alert">{state.randomError}</p>
        )}
      </div>

      <div className="other-topic">
        <label className="other-topic__label" htmlFor="custom-topic">OR TYPE ANY TOPIC</label>
        <div className="other-topic__control">
          <input
            id="custom-topic"
            value={other}
            onChange={(event) => actions.setOther(event.target.value)}
            onKeyDown={onOtherKeyDown}
            placeholder="Try: Indian history"
            maxLength={MAX_TOPIC_CHARACTERS}
            className="other-topic__input"
            disabled={state.randomLoading}
          />
          <button className="other-topic__submit" onClick={actions.startQuiz} disabled={state.randomLoading}>
            Make my quiz
          </button>
        </div>
      </div>

      <p className="landing__play-count" aria-label={`${QUIZZES_PLAYED} quizzes played so far`}>
        <AnimatedNumber
          className="landing__play-count-number"
          springOptions={{ bounce: 0, duration: 1800 }}
          value={QUIZZES_PLAYED}
        />
        <span>quizzes played so far</span>
      </p>
    </div>
  );
}
