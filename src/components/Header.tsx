import './Header.css';

interface HeaderProps {
  inQuiz: boolean;
  topic: string;
  questionNum: string;
  questionTotal: number;
  onHome: () => void;
  onBack: () => void;
  onToggleMenu: () => void;
  onNewQuiz: () => void;
}

export default function Header({ inQuiz, topic, questionNum, questionTotal, onHome, onBack, onToggleMenu, onNewQuiz }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__logo" onClick={onHome} role="button" tabIndex={0}>
        <span className="site-header__wordmark">
          <span>Oddly</span>
          <span>Specific</span>
        </span>
        <span className="site-header__star" aria-hidden="true">
          ∗
        </span>
      </div>

      {inQuiz && (
        <div className="site-header__progress">
          <span className="site-header__divider" aria-hidden="true" />
          <span className="site-header__back" onClick={onBack} role="button" aria-label="Back" tabIndex={0}>
            ‹
          </span>
          <span className="site-header__topic">{topic}</span>
          <span className="site-header__count">
            <b>{questionNum}</b> / {questionTotal}
          </span>
          <button className="site-header__new" onClick={onNewQuiz}>New quiz</button>
        </div>
      )}

      {!inQuiz && (
        <button className="site-header__menu-btn" onClick={onToggleMenu} aria-label="Menu">
          <span />
          <span />
          <span />
        </button>
      )}
    </header>
  );
}
