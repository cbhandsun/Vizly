// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProTimelineChrome } from '../ProTimelineChrome';
import {
  coerceProTimelineViewMode,
  getProTimelineZoomControlState,
  stepProTimelineZoom,
} from '../proTimelineChromeBoundary';

const renderChrome = (
  overrides: Partial<React.ComponentProps<typeof ProTimelineChrome>> = {},
) => render(
  <ProTimelineChrome
    borderColor="#ddd"
    glassBackground="#fff"
    shadowColor="rgba(0, 0, 0, 0.1)"
    secondaryTextColor="#666"
    showResourceDrawer={false}
    onOpenResourceDrawer={vi.fn()}
    showCriticalPath={false}
    criticalTaskCount={0}
    onToggleCriticalPath={vi.fn()}
    showBaseline={false}
    hasBaseline={false}
    onToggleBaseline={vi.fn()}
    onSaveBaseline={vi.fn()}
    onClearBaseline={vi.fn()}
    viewMode="day"
    onViewModeChange={vi.fn()}
    zoomLevel={1}
    onZoomChange={vi.fn()}
    {...overrides}
  />,
);

describe('timeline navigation boundaries', () => {
  it('coerces view modes and rejects unknown external values', () => {
    expect(coerceProTimelineViewMode('month', 'day')).toBe('month');
    expect(coerceProTimelineViewMode('', 'week')).toBe('week');
    expect(coerceProTimelineViewMode({ mode: 'month' }, 'quarter')).toBe('quarter');
  });

  it('normalizes invalid and extreme zoom values', () => {
    expect(getProTimelineZoomControlState(Number.NaN)).toEqual({
      zoom: 1,
      percentage: 100,
      canZoomOut: true,
      canReset: false,
      canZoomIn: true,
    });
    expect(stepProTimelineZoom(0.15, -0.2)).toBe(0.15);
    expect(stepProTimelineZoom(5, 0.2)).toBe(5);
    expect(stepProTimelineZoom(Number.POSITIVE_INFINITY, 0.2)).toBe(1.2);
  });

  it('emits a validated view mode when the segmented control changes', () => {
    const onViewModeChange = vi.fn();
    renderChrome({ onViewModeChange });

    fireEvent.click(screen.getByRole('radio', { name: '月' }));

    expect(onViewModeChange).toHaveBeenCalledWith('month');
  });

  it('supports roving keyboard selection across view modes', () => {
    const onViewModeChange = vi.fn();
    renderChrome({ viewMode: 'week', onViewModeChange });

    const week = screen.getByRole('radio', { name: '周' });
    expect(week.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(week, { key: 'ArrowRight' });

    expect(onViewModeChange).toHaveBeenCalledWith('month');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '月' }));
  });

  it('disables no-op actions at the default and minimum zoom boundaries', () => {
    const onZoomChange = vi.fn();
    const { rerender } = renderChrome({ onZoomChange });

    expect(screen.getByRole('button', { name: '恢复时间轴到 100%' })).toHaveProperty('disabled', true);
    expect(screen.getByText('当前视图：天，缩放 100%').getAttribute('role')).toBe('status');

    rerender(renderChromeElement({ zoomLevel: 0.15, viewMode: 'month', onZoomChange }));
    const zoomOut = screen.getByRole('button', { name: '缩小时间轴' });
    expect(zoomOut).toHaveProperty('disabled', true);
    expect(screen.getByText('当前视图：月，缩放 15%').getAttribute('role')).toBe('status');
    fireEvent.click(zoomOut);
    expect(onZoomChange).not.toHaveBeenCalled();
  });

  it('disables zoom-in at the maximum and emits only valid actions', () => {
    const onZoomChange = vi.fn();
    render(renderChromeElement({ zoomLevel: 5, onZoomChange }));

    const zoomIn = screen.getByRole('button', { name: '放大时间轴' });
    expect(zoomIn).toHaveProperty('disabled', true);
    fireEvent.click(zoomIn);
    expect(onZoomChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '缩小时间轴' }));
    expect(onZoomChange).toHaveBeenCalledWith(4.8);
  });
});

const renderChromeElement = (
  overrides: Partial<React.ComponentProps<typeof ProTimelineChrome>> = {},
) => (
  <ProTimelineChrome
    borderColor="#ddd"
    glassBackground="#fff"
    shadowColor="rgba(0, 0, 0, 0.1)"
    secondaryTextColor="#666"
    showResourceDrawer={false}
    onOpenResourceDrawer={vi.fn()}
    showCriticalPath={false}
    criticalTaskCount={0}
    onToggleCriticalPath={vi.fn()}
    showBaseline={false}
    hasBaseline={false}
    onToggleBaseline={vi.fn()}
    onSaveBaseline={vi.fn()}
    onClearBaseline={vi.fn()}
    viewMode="day"
    onViewModeChange={vi.fn()}
    zoomLevel={1}
    onZoomChange={vi.fn()}
    {...overrides}
  />
);
