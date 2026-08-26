import './QuizIntro.css';
import type { QuizActions } from '../types';

interface QuizIntroProps {
  topic: string;
  teaser: string;
  questionTotal: number;
  actions: QuizActions;
}

export default function QuizIntro({ topic, teaser, questionTotal, actions }: QuizIntroProps) {
  return (
    <main className="quiz-intro">
      <div className="section-label">YOUR SET IS READY</div>
      <h1 className="quiz-intro__title">{questionTotal} Questions on {topic}</h1>
      <div className="rule" />
      <p className="quiz-intro__teaser">
        {teaser || 'Origins, overlooked details, practical inventions, and a few things hiding in plain sight.'}
      </p>
      <div className="quiz-intro__note">
        <span className="quiz-intro__number">{questionTotal}</span>
        <span>No score. No timer. Take your time with each one.</span>
      </div>
      <button className="btn btn--forest quiz-intro__start" onClick={actions.startPlay}>
        <span>Start quiz</span>
        <span className="btn__arrow">&rarr;</span>
      </button>
      <button className="quiz-intro__change" onClick={actions.newTopic}>Choose another topic</button>
    </main>
  );
}
