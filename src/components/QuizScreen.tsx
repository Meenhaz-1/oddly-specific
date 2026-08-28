import './QuizScreen.css';
import RevealCurtain from './RevealCurtain';
import ImagePlaceholder from './ImagePlaceholder';
import type { QuizActions, QuizQuestion, QuizState } from '../types';

interface QuizScreenProps {
  state: QuizState;
  question: QuizQuestion;
  actions: QuizActions;
}

export default function QuizScreen({ state, question: q, actions }: QuizScreenProps) {
  const revealed = state.stage >= 1;
  const notRevealed = !revealed;
  const shownClues = q.kind === 'connect' ? q.clues || [] : (q.clues || []).slice(0, state.clueCount);
  const moreClues = q.kind === 'clues' && state.clueCount < (q.clues || []).length && !revealed;

  const slideClass = state.slide === 0 ? 'is-settled' : state.slide === -1 ? 'is-leaving' : 'is-entering';

  return (
    <div className={`quiz ${slideClass}`}>
      <div className="section-heading section-heading--tight">
        <span className="section-label">{q.label}</span>
        <span className="section-heading__rule" />
      </div>

      <h2 className="quiz__setup">{q.setup}</h2>
      {q.ask && <h3 className="quiz__ask">{q.ask}</h3>}

      {q.kind === 'image' && (
        <div className="quiz__image-block">
          <div className="quiz__tape" />
          <div
            className="quiz__image"
            onClick={actions.openViewer}
            style={{ filter: revealed ? 'saturate(.85) contrast(.94) opacity(.72)' : 'none' }}
          >
            <ImagePlaceholder alt={q.imgAlt ?? 'Question image'} src={q.imgSrc} />
          </div>
          {notRevealed && q.note && (
            <div className="quiz__image-note">
              <span className="hand">{q.note}</span>
              <span className="hand">&rarr;</span>
            </div>
          )}
        </div>
      )}

      {(q.kind === 'clues' || q.kind === 'connect') && (
        <div className="quiz__clues">
          {shownClues.map((c) => (
            <div key={c.tag} className="quiz__clue">
              <div className="quiz__clue-tag">{c.tag}</div>
              <p className="quiz__clue-text">{c.text}</p>
            </div>
          ))}
          {moreClues && (
            <button className="btn--pill" onClick={actions.nextClue}>
              Pull the next clue
            </button>
          )}
        </div>
      )}

      {q.kind === 'choice' && (
        <div className="quiz__choices">
          {(q.choices || []).map((c) => (
            <div
              key={c.key}
              className="quiz__choice"
              onClick={() => actions.pickChoice(c.key)}
              style={{ background: state.pick === c.key ? 'rgba(216,161,28,.18)' : 'transparent' }}
            >
              <span className="quiz__choice-key">{c.key}</span>
              <span className="quiz__choice-text">{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {q.kind === 'blank' && (
        <div className="quiz__blank">
          <p className="quiz__blank-lead">
            1 rupee = 16 annas, so <i>solah anna</i> came to mean
          </p>
          <div className="quiz__blank-line">&mdash;&mdash;&mdash;&mdash;</div>
        </div>
      )}

      <RevealCurtain stage={state.stage} rolling={state.roll} className="quiz__reveal">
        <div className="quiz__answer-wrap">
          <div className="hand-answer">{q.answer}</div>
          <p className="quiz__explain">{q.explain}</p>

          <div className="quiz__sources-toggle" onClick={actions.toggleSources}>
            <span className="quiz__sources-icon" />
            <span className="quiz__sources-label">Sources &middot; {q.sources?.length ?? 0}</span>
            <span
              className="quiz__sources-chevron"
              style={{ transform: state.sourcesOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              &#9662;
            </span>
          </div>

          {state.sourcesOpen && (
            <div className="quiz__sources-list">
              {(q.sources || []).map((s) => (
                <div key={s.title} className="quiz__source">
                  <div className="quiz__source-title">{s.title}</div>
                  <div className="quiz__source-meta">{s.meta}</div>
                </div>
              ))}
            </div>
          )}

          <div className="quiz__vote">
            <span className="quiz__vote-prompt">Was this a good question?</span>
            <div className="quiz__vote-btns">
              <button
                onClick={actions.voteUp}
                className="quiz__vote-btn"
                style={{ background: state.vote === 'up' ? 'rgba(22,52,42,.14)' : 'transparent' }}
                aria-label="Rate this question good"
              >
                <span aria-hidden="true">&#128077;</span> Good
              </button>
              <button
                onClick={actions.voteDown}
                className="quiz__vote-btn quiz__vote-btn--weak"
                style={{ background: state.vote === 'down' ? 'rgba(22,52,42,.09)' : 'transparent' }}
                aria-label="Rate this question weak"
              >
                <span aria-hidden="true">&#128078;</span> Weak
              </button>
            </div>
          </div>
        </div>
      </RevealCurtain>

      <div className="quiz__cta is-floating">
        {notRevealed ? (
          <div>
            <button className="btn btn--forest" onClick={actions.revealAnswer}>
              <span>Reveal answer</span>
              <span className="btn__arrow">&rarr;</span>
            </button>
            <div className="quiz__skip" onClick={actions.next}>
              Skip
            </div>
          </div>
        ) : (
          <button className="btn btn--gold" onClick={actions.next}>
            <span>Next question</span>
            <span className="btn__arrow">&rarr;</span>
          </button>
        )}
      </div>
    </div>
  );
}
