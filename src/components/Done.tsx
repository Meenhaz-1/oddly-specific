import './Done.css';
import type { QuizActions, QuizMode, QuizQuestion, SeenState } from '../types';

interface DoneProps {
  topic: string;
  bank: QuizQuestion[];
  seen: Record<number, SeenState>;
  shareStatus: string;
  quizMode: QuizMode;
  actions: QuizActions;
}

export default function Done({ topic, bank, seen, shareStatus, quizMode, actions }: DoneProps) {
  const random = quizMode === 'random';
  return (
    <div className="done">
      <div className="section-label">END OF SET{random ? ' · FROM THE ARCHIVE' : ` · ${topic}`}</div>
      <h2 className="done__title">
        {random ? `You finished ${bank.length} Questions from the Archive.` : `You finished ${bank.length} Questions on ${topic}.`}
      </h2>
      <div className="rule" />
      <p className="done__sub">
        {random
          ? 'Ready for another mix? The archive will avoid repeats until you have worked through the available questions.'
          : 'The set stays exactly as you played it. Share it with someone who would enjoy working through the same questions.'}
      </p>

      <div className="done__recap">
        {bank.map((r, i) => {
          const state = seen[i] === 'revealed' ? 'revealed' : seen[i] === 'skipped' ? 'skipped' : 'unseen';
          return (
            <div key={r.label + i} className="done__row">
              <span className="done__num" style={{ color: state === 'revealed' ? 'var(--forest)' : 'var(--faint)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="done__body">
                <div className="done__setup">{r.ask || r.setup}</div>
                <div className="done__answer">{r.answer}</div>
              </div>
              <span className="done__state">{state}</span>
            </div>
          );
        })}
      </div>

      <div className="done__actions">
        {random ? (
          <>
            <button className="btn btn--forest" onClick={actions.again}>Pick {bank.length} more</button>
            <button className="btn btn--outline" onClick={actions.newTopic}>Choose a subject</button>
          </>
        ) : (
          <>
            <button className="btn btn--forest" onClick={actions.share}>
              <span>{shareStatus || 'Share this quiz'}</span>
              <span className="btn__arrow">&rarr;</span>
            </button>
            <button className="btn btn--gold" onClick={actions.again}>Generate {bank.length} more on {topic}</button>
            <button className="btn btn--outline" onClick={actions.relatedTopic}>Try a related topic</button>
            <button className="done__new-topic" onClick={actions.newTopic}>Start a new topic</button>
          </>
        )}
      </div>
    </div>
  );
}
