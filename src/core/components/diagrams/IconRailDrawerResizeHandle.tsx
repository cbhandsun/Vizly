import React, { useCallback } from 'react';

import { resolveIconRailDrawerKeyboardWidth } from './iconRailDrawerResize';
import {
  ICON_RAIL_DRAWER_MAX_WIDTH,
  ICON_RAIL_DRAWER_MIN_WIDTH,
} from './iconRailSidebarStorage';

interface IconRailDrawerResizeHandleProps {
  currentWidth: number;
  hint: string;
  label: string;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onResize: (nextWidth: number) => void;
}

export const IconRailDrawerResizeHandle: React.FC<IconRailDrawerResizeHandleProps> = ({
  currentWidth,
  hint,
  label,
  onMouseDown,
  onResize,
}) => {
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const nextWidth = resolveIconRailDrawerKeyboardWidth({
      currentWidth,
      key: event.key,
      shiftKey: event.shiftKey,
    });
    if (nextWidth === null) return;

    event.preventDefault();
    onResize(nextWidth);
  }, [currentWidth, onResize]);

  return (
    <div
      className="side-drawer-resize-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={ICON_RAIL_DRAWER_MIN_WIDTH}
      aria-valuemax={ICON_RAIL_DRAWER_MAX_WIDTH}
      aria-valuenow={currentWidth}
      aria-valuetext={`${currentWidth}px`}
      title={hint}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={onMouseDown}
    >
      <span className="side-drawer-resize-grip" aria-hidden="true" />
    </div>
  );
};
