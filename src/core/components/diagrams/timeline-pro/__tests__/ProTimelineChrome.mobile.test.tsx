// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProTimelineSwitchControl } from '../ProTimelineSwitchControl';

const css = readFileSync(
  resolve(process.cwd(), 'src/core/components/diagrams/timeline-pro/ProTimelineCanvas.css'),
  'utf8',
);

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
});
