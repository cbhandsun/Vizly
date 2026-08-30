// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FlowchartLayoutProgress } from '../FlowchartLayoutProgress';

describe('FlowchartLayoutProgress', () => {
  it('announces an in-progress layout with a decorative spinner', () => {
    const { container } = render(
      <FlowchartLayoutProgress label="正在应用布局…" visible />,
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('正在应用布局…');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(
      container.querySelector('.flowchart-layout-progress__spinner')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('does not leave a stale status after the layout finishes', () => {
    render(<FlowchartLayoutProgress label="正在应用布局…" visible={false} />);

    expect(screen.queryByRole('status')).toBeNull();
  });
});
