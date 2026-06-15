import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Tooltip from '../Tooltip';
import { calculateTooltipPosition, normalizeTooltipDelay } from '../tooltipPosition';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Tooltip', () => {
  it('keeps tooltip positions within the viewport edge cases', () => {
    expect(calculateTooltipPosition({ left: 20, right: 40, top: 8, bottom: 28 }, 500)).toEqual({ x: 50, y: 8 });
    expect(calculateTooltipPosition({ left: 260, right: 290, top: 8, bottom: 28 }, 300)).toEqual({ x: 50, y: 38 });
    expect(calculateTooltipPosition({ left: 280, right: 300, top: -10, bottom: 10 }, 400)).toEqual({ x: 20, y: 0 });
  });

  it('bounds invalid or excessive delays', () => {
    expect(normalizeTooltipDelay(-1)).toBe(0);
    expect(normalizeTooltipDelay(Number.NaN)).toBe(0);
    expect(normalizeTooltipDelay(6500)).toBe(5000);
    expect(normalizeTooltipDelay(12.8)).toBe(12);
  });

  it('shows and hides tooltip content on hover', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Details" delay={20}>
        <button type="button">Target</button>
      </Tooltip>
    );

    const trigger = screen.getByText('Target').parentElement?.parentElement as HTMLElement;
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByText('Details')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByText('Details')).toBeTruthy();

    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText('Details')).toBeNull();
  });
});
