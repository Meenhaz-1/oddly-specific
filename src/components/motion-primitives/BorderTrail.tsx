import type { CSSProperties } from 'react';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import './BorderTrail.css';

// Adapted from Motion Primitives' MIT-licensed Border Trail component.
// The rectangular light source creates a tapered trail and stays static for reduced motion.

export interface BorderTrailProps {
  className?: string;
  size?: number;
  thickness?: number;
  cornerRadius?: number;
  transition?: Transition;
  style?: CSSProperties;
}

export function BorderTrail({
  className = '',
  size = 60,
  thickness = 14,
  cornerRadius = 0,
  transition,
  style,
}: BorderTrailProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <span className="border-trail border-trail--static" aria-hidden="true" />;
  }

  return (
    <span className="border-trail" aria-hidden="true">
      <motion.span
        className={`border-trail__light ${className}`.trim()}
        style={{
          width: size,
          height: thickness,
          offsetPath: `rect(0 auto auto 0 round ${cornerRadius}px)`,
          offsetRotate: 'auto',
          ...style,
        }}
        animate={{ offsetDistance: ['0%', '100%'] }}
        transition={transition ?? { repeat: Infinity, duration: 5, ease: 'linear' }}
      />
    </span>
  );
}
