import './ImagePlaceholder.css';
import type { MouseEventHandler } from 'react';

/**
 * Stand-in for the design's `<image-slot>` in its unfilled state — a
 * textured card bearing the archival caption, since this port has no
 * real photo library behind it. Drop real photos in by swapping the
 * background-image on `.img-slot` per id if/when art is sourced.
 */
interface ImagePlaceholderProps {
  alt: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  className?: string;
}

export default function ImagePlaceholder({ alt, onClick, className = '' }: ImagePlaceholderProps) {
  return (
    <div
      className={`img-slot ${className}`.trim()}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={alt}
    >
      <span className="img-slot__mark" aria-hidden="true">
        ✳
      </span>
      <span className="img-slot__caption">{alt}</span>
    </div>
  );
}
