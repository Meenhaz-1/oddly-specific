import { useState } from 'react';
import './Making.css';
import { useElapsed } from '../hooks/useElapsed';
import { EXPECTED_GENERATION_MS } from '../hooks/useQuizEngine';
import type { QuizActions } from '../types';

const PHASES = [
  {
    head: 'Reading around the subject',
    lines: [
      'Pulling the primary sources',
      'Old newspapers, mostly',
      "Somebody's thesis from 1994",
      'A museum catalogue and two books',
    ],
  },
  {
    head: 'Checking each claim against a source',
    lines: [
      'Two sources disagree on the date',
      'Found a better citation',
      'Confirming the number',
      "Dropping one we can't back up",
    ],
  },
  {
    head: 'Throwing out the boring ones',
    lines: [
      'Six survive',
      'This one is too easy',
      'Keeping the one about the bricks',
      'Ordering them so the best lands last',
    ],
  },
];

const WARMUPS = [
  { q: 'A pineapple takes about this long to grow one fruit.', a: 'Two years' },
  {
    q: 'Together, both human feet contain this many bones, out of 206 in the adult body.',
    a: '52 — slightly more than a quarter of the skeleton',
  },
  { q: 'Venetian glassmakers were moved to the island of Murano in 1291 for this reason.', a: 'Fire risk' },
];

const TICK_MS = 220;
const NOTE_MS = 2400;
const NOTE_DELAY_MS = 400;
const PHASE_AT = [0.06, 0.34, 0.66];

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

interface MakingProps {
  topic: string;
  error: string;
  actions: QuizActions;
}

export default function Making({ topic, error, actions }: MakingProps) {
  const elapsed = useElapsed(TICK_MS, !error);
  const [warmup] = useState(() => WARMUPS[Math.floor(Math.random() * WARMUPS.length)]!);
  const [warmupOpen, setWarmupOpen] = useState(false);

  const fraction = elapsed / EXPECTED_GENERATION_MS;
  const phase = PHASE_AT.filter((threshold) => fraction >= threshold).length;
  const notes = PHASES[Math.min(PHASES.length - 1, phase)]!.lines;
  const noteStep = Math.max(0, Math.floor((elapsed - NOTE_DELAY_MS) / NOTE_MS));
  const barWidth = `${(94 * (1 - Math.exp(-2.4 * fraction))).toFixed(1)}%`;

  return (
    <div className="making">
      <div className="making__head">
        <div className="section-label">ASSEMBLING</div>
        {!error && (
          <div className="making__elapsed" aria-hidden="true">
            {formatElapsed(elapsed)}
          </div>
        )}
      </div>

      <h2 className="making__title">Two questions on {topic}.</h2>

      {error ? (
        <div className="making__error" role="alert">
          <p>{error}</p>
          <button className="btn btn--forest" onClick={actions.retryGeneration}>
            Try again
          </button>
          <button className="making__back" onClick={actions.newTopic}>
            Return to topics
          </button>
        </div>
      ) : (
        <>
          <div className="making__bar">
            <div className="making__bar-fill" style={{ width: barWidth }} />
          </div>

          <div className="making__now" role="status" aria-live="polite">
            <span className="hand making__now-arrow" aria-hidden="true">
              &rarr;
            </span>
            <span className="hand making__now-text">{notes[noteStep % notes.length]}</span>
          </div>

          <div className="making__list">
            {PHASES.map((item, index) => (
              <div
                key={item.head}
                className="making__row"
                style={{ opacity: phase >= index + 1 ? 1 : 0.2 }}
              >
                <span className="hand" style={{ opacity: phase >= index + 1 ? 1 : 0 }} aria-hidden="true">
                  &#10003;
                </span>
                <span className="making__step">{item.head}</span>
              </div>
            ))}
          </div>

          <div className="warmup">
            <div className="warmup__label section-label">WHILE YOU WAIT &middot; ONE FROM THE ARCHIVE</div>
            <p className="warmup__question">{warmup.q}</p>
            <button
              className="warmup__reveal hand"
              onClick={() => setWarmupOpen((open) => !open)}
              aria-expanded={warmupOpen}
            >
              {warmupOpen ? warmup.a : 'Tap to see the answer'}
            </button>
          </div>

          <p className="making__footnote">A good set takes a moment.</p>
          {fraction > 0.72 && <p className="making__slow">Still going — the last few checks are the slow ones.</p>}
        </>
      )}
    </div>
  );
}
