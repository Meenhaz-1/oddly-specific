import './QuizIntro.css';
import type { QuizActions, QuizMode } from '../types';
import { BorderTrail } from './motion-primitives/BorderTrail';

interface QuizIntroProps {
  topic: string;
  teaser: string;
  questionTotal: number;
  quizMode: QuizMode;
  actions: QuizActions;
}

export default function QuizIntro({ topic, teaser, questionTotal, quizMode, actions }: QuizIntroProps) {
  return (
    <main className="quiz-intro">
      <div className="section-label">YOUR SET IS READY</div>
      <h1 className="quiz-intro__title">
        {quizMode === 'random' ? `${questionTotal} Questions from the Archive` : `${questionTotal} Questions on ${topic}`}
      </h1>
      <div className="rule" />
      <p className="quiz-intro__teaser">
        {teaser || 'Origins, overlooked details, practical inventions, and a few things hiding in plain sight.'}
      </p>
      <div className="quiz-intro__note">
        <span className="quiz-intro__number">{questionTotal}</span>
        <span>No score. No timer. Take your time with each one.</span>
      </div>
      <button className="btn btn--forest quiz-intro__start" onClick={actions.startPlay}>
        <BorderTrail
          size={128}
          thickness={18}
          transition={{ repeat: Infinity, duration: 10, ease: 'linear' }}
          style={{
            background:
              'radial-gradient(ellipse at center, rgb(213 229 221 / 92%) 0%, rgb(174 203 189 / 72%) 28%, rgb(126 166 147 / 30%) 54%, transparent 78%)',
          }}
        />
        <span>Start quiz</span>
        <span className="btn__arrow">&rarr;</span>
      </button>
      <button className="quiz-intro__change" onClick={actions.newTopic}>Choose another topic</button>
    </main>
  );
}
