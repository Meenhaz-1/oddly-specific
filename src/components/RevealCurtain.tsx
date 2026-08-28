import './RevealCurtain.css';
import { REVEAL_MS } from '../hooks/useQuizEngine';
import type { CSSProperties, ReactNode } from 'react';
import type { RevealStage } from '../types';

/**
 * The "paper roll" reveal used for each question's answer: content sits
 * clipped shut, a curtain edge sweeps left-to-right as it opens, mirroring
 * the design's clip-path animation.
 *
 * `stage`: 0 not mounted, 1 mounted/closed, 2 open.
 * `rolling`: true while the edge highlight should be visible.
 */
interface RevealCurtainProps {
  stage: RevealStage;
  rolling: boolean;
  edgeWidth?: number;
  className?: string;
  children: ReactNode;
}

type RevealStyle = CSSProperties & { '--reveal-ms': string };

export default function RevealCurtain({ stage, rolling, edgeWidth = 54, className = '', children }: RevealCurtainProps) {
  if (stage === 0) return null;
  const open = stage >= 2;
  return (
    <div className={`reveal ${className}`.trim()} style={{ '--reveal-ms': `${REVEAL_MS}ms` } as RevealStyle}>
      <div className={`reveal__clip ${open ? 'is-open' : ''}`}>{children}</div>
      {rolling && (
        <div
          className={`reveal__edge ${open ? 'is-open' : ''}`}
          style={{ width: edgeWidth, left: open ? 'calc(100% - 6px)' : -(edgeWidth - 6) }}
        />
      )}
    </div>
  );
}
