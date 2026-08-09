// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IconRailDrawerResizeHandle } from '../IconRailDrawerResizeHandle';

describe('IconRailDrawerResizeHandle', () => {
  it('exposes a focusable, labelled separator with the current range value', () => {
    render(
      <IconRailDrawerResizeHandle
        currentWidth={300}
        label="Resize sidebar"
        hint="Drag or use arrow keys"
        onMouseDown={vi.fn()}
        onResize={vi.fn()}
      />,
    );

    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuemin')).toBe('240');
    expect(handle.getAttribute('aria-valuemax')).toBe('400');
    expect(handle.getAttribute('aria-valuenow')).toBe('300');
    expect(handle.getAttribute('aria-valuetext')).toBe('300px');
    expect(handle.getAttribute('title')).toBe('Drag or use arrow keys');
    expect(handle.getAttribute('tabindex')).toBe('0');
  });

  it('resizes from supported keys and preserves unrelated browser behavior', () => {
    const onResize = vi.fn();
    render(
      <IconRailDrawerResizeHandle
        currentWidth={300}
        label="Resize sidebar"
        hint="Drag or use arrow keys"
        onMouseDown={vi.fn()}
        onResize={onResize}
      />,
    );

    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyDown(handle, { key: 'Home' });
    fireEvent.keyDown(handle, { key: 'End' });
    fireEvent.keyDown(handle, { key: 'Enter' });

    expect(onResize.mock.calls.map(([width]) => width)).toEqual([304, 280, 240, 400]);
  });

  it('forwards mouse drag initiation from the expanded hit target', () => {
    const onMouseDown = vi.fn();
    render(
      <IconRailDrawerResizeHandle
        currentWidth={280}
        label="Resize sidebar"
        hint="Drag or use arrow keys"
        onMouseDown={onMouseDown}
        onResize={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('separator', { name: 'Resize sidebar' }), {
      clientX: 280,
    });
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });
});
