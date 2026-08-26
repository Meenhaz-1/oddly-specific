import './Done.css';
import type { QuizActions, QuizQuestion, SeenState } from '../types';

interface DoneProps {
  topic: string;
  bank: QuizQuestion[];
  seen: Record<number, SeenState>;
  shareStatus: string;
  actions: QuizActions;
}

export default function Done({ topic, bank, seen, shareStatus, actions }: DoneProps) {
  return (
    <div className="done">
      <div className="section-label">END OF SET &middot; {topic}</div>
      <h2 className="done__title">You finished {bank.length} Questions on {topic}.</h2>
      <div className="rule" />
      <p className="done__sub">
        The set stays exactly as you played it. Share it with someone who would enjoy working through the same questions.
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
        <button className="btn btn--forest" onClick={actions.share}>
          <span>{shareStatus || 'Share this quiz'}</span>
          <span className="btn__arrow">&rarr;</span>
        </button>
        <button className="btn btn--gold" onClick={actions.again}>Generate {bank.length} more on {topic}</button>
        <button className="btn btn--outline" onClick={actions.relatedTopic}>Try a related topic</button>
        <button className="done__new-topic" onClick={actions.newTopic}>Start a new topic</button>
      </div>
    </div>
  );
}
