import { useEffect, useRef } from 'react';
import { FaCompress, FaExpand } from 'react-icons/fa';

interface MinimapCollapseControlProps {
  expandLabel: string;
  isMinimized: boolean;
  minimizeLabel: string;
  onToggle: () => void;
}

export const MinimapCollapseControl = ({
  expandLabel,
  isMinimized,
  minimizeLabel,
  onToggle,
}: MinimapCollapseControlProps) => {
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const minimizeButtonRef = useRef<HTMLButtonElement>(null);
  const previousMinimizedRef = useRef(isMinimized);

  useEffect(() => {
    if (previousMinimizedRef.current === isMinimized) return;
    previousMinimizedRef.current = isMinimized;
    queueMicrotask(() => {
      (isMinimized ? expandButtonRef.current : minimizeButtonRef.current)?.focus();
    });
  }, [isMinimized]);

  if (isMinimized) {
    return (
      <button
        ref={expandButtonRef}
        type="button"
        aria-label={expandLabel}
        title={expandLabel}
        className="minimap-expand-button"
        onClick={onToggle}
      >
        <FaExpand aria-hidden="true" className="minimap-expand-icon" />
      </button>
    );
  }

  return (
    <div className="minimap-controls">
      <button
        ref={minimizeButtonRef}
        type="button"
        aria-label={minimizeLabel}
        title={minimizeLabel}
        className="minimap-control-btn"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
      >
        <FaCompress aria-hidden="true" />
      </button>
    </div>
  );
};
