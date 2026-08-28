import './Landing.css';
import RevealCurtain from './RevealCurtain';
import ImagePlaceholder from './ImagePlaceholder';
import { SAMPLE_QUESTION, TOPICS } from '../data/questions';
import type { KeyboardEvent } from 'react';
import type { QuizActions, QuizState } from '../types';

interface LandingProps {
  state: QuizState;
  actions: QuizActions;
}

export default function Landing({ state, actions }: LandingProps) {
  const { sample, sampleRoll, other } = state;

  const onOtherKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') actions.startQuiz();
  };

  return (
    <div className="landing">
      <h1 className="landing__hero">A better question changes the room.</h1>
      <div className="rule" />
      <p className="landing__sub">
        Pick a subject. We&rsquo;ll make ten worth asking &mdash; each one checked against a real source.
      </p>

      <div className="landing__surprise">
        <button
          className="btn btn--forest landing__surprise-button"
          onClick={actions.randomQuiz}
          disabled={state.randomLoading}
        >
          <span>{state.randomLoading ? 'Picking from the archive…' : 'Surprise me with 10 questions'}</span>
          <span className="btn__arrow" aria-hidden="true">&rarr;</span>
        </button>
        {state.randomError && (
          <p className="landing__surprise-error" role="alert">{state.randomError}</p>
        )}
      </div>

      <div className="sample">
        <div className="sample__clip sample__clip--a" aria-hidden="true" />
        <div className="sample__clip sample__clip--b" aria-hidden="true" />

        <div className="sample__card">
          <div className="section-label">TRY ONE</div>
          <p className="sample__question">{SAMPLE_QUESTION.setup}</p>

          <div className="sample__image" onClick={actions.openSampleViewer}>
            <ImagePlaceholder alt={SAMPLE_QUESTION.imgAlt ?? 'Sample question image'} src={SAMPLE_QUESTION.imgSrc} />
            <div className="sample__tape" />
          </div>

          {sample === 0 && (
            <div className="sample__prompt">
              <span className="hand">your guess?</span>
              <span className="hand">&rarr;</span>
            </div>
          )}

          <RevealCurtain stage={sample} rolling={sampleRoll} edgeWidth={46} className="sample__reveal">
            <div className="sample__answer-wrap">
              <div className="hand-answer">{SAMPLE_QUESTION.answer}</div>
              <p className="sample__explain">{SAMPLE_QUESTION.explain}</p>
            </div>
          </RevealCurtain>
        </div>

        <button className="btn btn--gold sample__cta" onClick={actions.revealSample} disabled={!!sample}>
          <span>{sample ? 'Sample revealed' : 'Reveal sample'}</span>
          <span className="btn__arrow">&rarr;</span>
        </button>
      </div>

      <div className="section-heading">
        <span className="section-label section-label--muted">CHOOSE A SUBJECT</span>
        <span className="section-heading__rule" />
      </div>

      <div className="topics">
        {TOPICS.map((t) => (
          <div key={t.name} className="topics__row" onClick={() => actions.pickTopic(t.name)}>
            <span className="topics__tab" style={{ background: t.tab }} />
            <span className="topics__name">{t.name}</span>
            <span className="topics__count">{t.count}</span>
            <span className="topics__arrow">&rarr;</span>
          </div>
        ))}
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

      <p className="landing__footnote">Two questions. No score, no timer &mdash; just the pleasure of working one out.</p>
    </div>
  );
}
