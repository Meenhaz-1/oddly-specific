import './Viewer.css';
import ImagePlaceholder from './ImagePlaceholder';

interface ViewerProps {
  alt: string;
  onClose: () => void;
}

export default function Viewer({ alt, onClose }: ViewerProps) {
  return (
    <div className="viewer" onClick={onClose} role="button" tabIndex={0} aria-label="Close image">
      <div className="viewer__frame">
        <ImagePlaceholder alt={alt} />
      </div>
      <div className="viewer__hint">Tap anywhere to close</div>
    </div>
  );
}
