import React, { useCallback, useRef } from 'react';

import type { ProTimelineViewMode } from '../../../hooks/useProTimelineEngine';

type ProTimelineViewModeControlProps = {
  value: ProTimelineViewMode;
  onChange: (value: ProTimelineViewMode) => void;
};

const VIEW_MODE_OPTIONS: ReadonlyArray<{ label: string; value: ProTimelineViewMode }> = [
  { label: '天', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '季', value: 'quarter' },
];

export const ProTimelineViewModeControl: React.FC<ProTimelineViewModeControlProps> = ({
  value,
  onChange,
}) => {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectAndFocus = useCallback((index: number) => {
    const option = VIEW_MODE_OPTIONS[index];
    if (!option) return;
    onChange(option.value);
    optionRefs.current[index]?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % VIEW_MODE_OPTIONS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + VIEW_MODE_OPTIONS.length) % VIEW_MODE_OPTIONS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = VIEW_MODE_OPTIONS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    selectAndFocus(nextIndex);
  }, [selectAndFocus]);

  return (
    <div className="pro-timeline-view-mode" role="radiogroup" aria-label="时间轴视图粒度">
      {VIEW_MODE_OPTIONS.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => { optionRefs.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className="pro-timeline-view-mode__option"
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
