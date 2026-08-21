// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { ProTimelineSwitchControl } from '../ProTimelineSwitchControl';
import { ProTaskRowActions } from '../ProTaskRowActions';

const css = readFileSync(
  resolve(process.cwd(), 'src/core/components/diagrams/timeline-pro/ProTimelineCanvas.css'),
  'utf8',
);

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

afterAll(() => vi.unstubAllGlobals());

describe('ProTimelineChrome mobile controls', () => {
  it('uses a semantic switch with a separate visual track', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProTimelineSwitchControl ariaLabel="显示关键路径" checked={false} onChange={onChange} />,
    );

    const control = screen.getByRole('switch', { name: '显示关键路径' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(
      <ProTimelineSwitchControl ariaLabel="显示关键路径" checked disabled onChange={onChange} />,
    );
    expect(control.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('expands every mobile chrome action to the commercial touch target', () => {
    expect(css).toMatch(/\.pro-timeline-control-target,[\s\S]*?\.pro-timeline-switch-control,[\s\S]*?\.pro-timeline-view-mode__option[\s\S]*?width: var\(--commercial-touch-target, 44px\) !important;[\s\S]*?height: var\(--commercial-touch-target, 44px\) !important;/);
    expect(css).toMatch(/\.pro-timeline-chrome--analysis[\s\S]*?justify-content: flex-start;/);
    expect(css).toMatch(/\.pro-timeline-chrome--scale[\s\S]*?justify-content: flex-start;/);
  });

  it('offers one commercial-sized mobile task menu with validated actions', async () => {
    const onAdd = vi.fn();
    const onDelete = vi.fn();
    render(
      <ProTaskRowActions
        taskName="Launch"
        primaryColor="#1677ff"
        deleteColor="#ff4d4f"
        onAdd={onAdd}
        onDelete={onDelete}
      />,
    );

    const menuButton = screen.getByRole('button', { name: 'Launch 任务操作' });
    expect(menuButton.className).toContain('pro-timeline-row-actions--mobile');
    fireEvent.click(menuButton);
    fireEvent.click(await screen.findByRole('menuitem', { name: /删除任务/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('extends direct-manipulation targets without changing timeline geometry', () => {
    expect(css).toMatch(/\.pro-timeline-row-actions--mobile\s*\{[\s\S]*?width: var\(--commercial-touch-target, 44px\);[\s\S]*?height: var\(--commercial-touch-target, 44px\);/);
    expect(css).toMatch(/\.pro-timeline-task-hierarchy-toggle::before,[\s\S]*?\.pro-timeline-task-connect-control::before,[\s\S]*?\.pro-timeline-task-progress-handle::before[\s\S]*?width: var\(--commercial-touch-target, 44px\);[\s\S]*?height: var\(--commercial-touch-target, 44px\);/);
    expect(css).toMatch(/\.pro-timeline-task-hierarchy-toggle\s*\{[\s\S]*?z-index: 2;/);
    expect(css).toMatch(/\.pro-timeline-task-bar\s*\{[\s\S]*?overflow: visible !important;/);
  });
});
