import './Making.css';
import type { QuizActions } from '../types';

const STEPS = ['Reading around the subject', 'Checking each claim against a source', 'Throwing out the boring ones'];

interface MakingProps {
  topic: string;
  prep: number;
  error: string;
  actions: QuizActions;
}

export default function Making({ topic, prep, error, actions }: MakingProps) {
  return (
    <div className="making">
      <div className="section-label">ASSEMBLING</div>
      <h2 className="making__title">Two questions on {topic}.</h2>
      {!error && <div className="making__list">
        {STEPS.map((step, i) => (
          <div key={step} className="making__row" style={{ opacity: prep >= i + 1 ? 1 : 0.18 }}>
            <span className="hand">&#10003;</span>
            <span className="making__step">{step}</span>
          </div>
        ))}
      </div>}
      {error ? (
        <div className="making__error" role="alert">
          <p>{error}</p>
          <button className="btn btn--forest" onClick={actions.retryGeneration}>Try again</button>
          <button className="making__back" onClick={actions.newTopic}>Return to topics</button>
        </div>
      ) : (
        <p className="making__footnote">A good set takes a moment.</p>
      )}
    </div>
  );
}
