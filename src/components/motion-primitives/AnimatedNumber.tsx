import { useEffect } from 'react';
import { motion, useReducedMotion, useSpring, useTransform, type SpringOptions } from 'motion/react';

// Adapted from Motion Primitives' MIT-licensed Animated Number component.
// This version adds an initial value and a reduced-motion fallback.

export interface AnimatedNumberProps {
  value: number;
  initialValue?: number;
  className?: string;
  springOptions?: SpringOptions;
}

export function AnimatedNumber({
  value,
  initialValue = 0,
  className = '',
  springOptions,
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const spring = useSpring(initialValue, springOptions);
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString());

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  if (reduceMotion) {
    return <span className={className}>{Math.round(value).toLocaleString()}</span>;
  }

  return <motion.span className={className}>{display}</motion.span>;
}
