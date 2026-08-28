import { Children, cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import useMeasure from 'react-use-measure';
import './InfiniteSlider.css';

// Adapted from Motion Primitives' MIT-licensed Infinite Slider component.
// This version supports keyboard-safe duplicates, pause states, and a static reduced-motion layout.

export interface InfiniteSliderProps {
  children: ReactNode;
  gap?: number;
  speed?: number;
  speedOnHover?: number;
  direction?: 'horizontal' | 'vertical';
  reverse?: boolean;
  className?: string;
  ariaLabel?: string;
}

type DuplicateProps = {
  'aria-hidden'?: boolean;
  tabIndex?: number;
  onMouseDown?: (event: React.MouseEvent) => void;
};

function duplicateChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child as ReactElement<DuplicateProps>, {
      'aria-hidden': true,
      tabIndex: -1,
      onMouseDown: (event) => event.preventDefault(),
    });
  });
}

export function InfiniteSlider({
  children,
  gap = 16,
  speed = 100,
  speedOnHover,
  direction = 'horizontal',
  reverse = false,
  className = '',
  ariaLabel,
}: InfiniteSliderProps) {
  const reduceMotion = useReducedMotion();
  const [hovering, setHovering] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [key, setKey] = useState(0);
  const [measureRef, bounds] = useMeasure();
  const translation = useMotionValue(0);
  const paused = hovering || focusWithin;
  const currentSpeed = paused && speedOnHover !== undefined ? speedOnHover : speed;
  const measuredSize = direction === 'horizontal' ? bounds.width : bounds.height;

  useEffect(() => {
    if (reduceMotion || measuredSize === 0 || currentSpeed <= 0) return;

    const distance = measuredSize + gap;
    const from = reverse ? -distance : 0;
    const to = reverse ? 0 : -distance;
    let controls;

    if (isTransitioning) {
      const remainingDistance = Math.abs(translation.get() - to);
      controls = animate(translation, [translation.get(), to], {
        duration: remainingDistance / currentSpeed,
        ease: 'linear',
        onComplete: () => {
          setIsTransitioning(false);
          setKey((value) => value + 1);
        },
      });
    } else {
      controls = animate(translation, [from, to], {
        duration: distance / currentSpeed,
        ease: 'linear',
        repeat: Infinity,
        repeatType: 'loop',
        repeatDelay: 0,
        onRepeat: () => translation.set(from),
      });
    }

    return () => controls.stop();
  }, [currentSpeed, direction, gap, isTransitioning, key, measuredSize, reduceMotion, reverse, translation]);

  const pause = () => {
    setIsTransitioning(true);
    setHovering(true);
  };

  const resume = () => {
    setIsTransitioning(true);
    setHovering(false);
  };

  if (reduceMotion) {
    return (
      <div
        className={`infinite-slider infinite-slider--static ${className}`.trim()}
        role={ariaLabel ? 'group' : undefined}
        aria-label={ariaLabel}
      >
        <div className="infinite-slider__set">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`infinite-slider ${className}`.trim()}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
    >
      <motion.div
        className={`infinite-slider__track infinite-slider__track--${direction}`}
        style={{
          ...(direction === 'horizontal' ? { x: translation } : { y: translation }),
          gap,
        }}
        onHoverStart={pause}
        onHoverEnd={resume}
        onFocusCapture={() => {
          setIsTransitioning(true);
          setFocusWithin(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsTransitioning(true);
            setFocusWithin(false);
          }
        }}
      >
        <div ref={measureRef} className={`infinite-slider__set infinite-slider__set--${direction}`}>
          {children}
        </div>
        <div
          className={`infinite-slider__set infinite-slider__set--${direction}`}
          aria-hidden="true"
        >
          {duplicateChildren(children)}
        </div>
      </motion.div>
    </div>
  );
}
