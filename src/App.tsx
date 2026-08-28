import './App.css';
import { useQuizEngine } from './hooks/useQuizEngine';
import Header from './components/Header';
import Menu from './components/Menu';
import Landing from './components/Landing';
import QuizScreen from './components/QuizScreen';
import Making from './components/Making';
import QuizIntro from './components/QuizIntro';
import Done from './components/Done';
import Viewer from './components/Viewer';
import { SAMPLE_QUESTION } from './data/questions';

export default function App() {
  const { state, question, bank, actions } = useQuizEngine();
  const inQuiz = state.screen === 'quiz';

  return (
    <div className="page">
      <div className="paper">
        <Header
          inQuiz={inQuiz}
          topic={state.topic}
          questionNum={String(state.qi + 1).padStart(2, '0')}
          questionTotal={bank.length}
          onHome={actions.goHome}
          onBack={actions.back}
          onToggleMenu={actions.toggleMenu}
          onNewQuiz={actions.newTopic}
        />

        {state.screen === 'landing' && state.menu && <Menu />}

        {state.screen === 'landing' && <Landing state={state} actions={actions} />}
        {state.screen === 'quiz' && <QuizScreen state={state} question={question} actions={actions} />}
        {state.screen === 'making' && (
          <Making topic={state.topic} error={state.generationError} actions={actions} />
        )}
        {state.screen === 'intro' && (
          <QuizIntro topic={state.topic} teaser={state.teaser} questionTotal={bank.length} quizMode={state.quizMode} actions={actions} />
        )}
        {state.screen === 'done' && (
          <Done topic={state.topic} bank={bank} seen={state.seen} shareStatus={state.shareStatus} quizMode={state.quizMode} actions={actions} />
        )}
      </div>

      {state.viewer && (
        <Viewer alt={(state.viewer === 'sample' ? SAMPLE_QUESTION.imgAlt : question.imgAlt) ?? 'Quiz image'} onClose={actions.closeViewer} />
      )}
    </div>
  );
}
