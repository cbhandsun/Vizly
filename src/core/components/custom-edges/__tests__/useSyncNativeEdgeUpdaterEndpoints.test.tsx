// @vitest-environment jsdom

import { useRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSyncNativeEdgeUpdaterEndpoints } from '../useSyncNativeEdgeUpdaterEndpoints';

const Harness = ({
  source,
  target,
}: {
  source: { x: number; y: number };
  target: { x: number; y: number };
}) => {
  const sentinelRef = useRef<SVGGElement>(null);
  useSyncNativeEdgeUpdaterEndpoints(sentinelRef, source, target);
  return (
    <svg>
      <g className="react-flow__edge">
        <circle className="react-flow__edgeupdater-source" cx="1" cy="2" />
        <circle className="react-flow__edgeupdater-target" cx="3" cy="4" />
        <g ref={sentinelRef} />
      </g>
    </svg>
  );
};

describe('useSyncNativeEdgeUpdaterEndpoints', () => {
  it('keeps the native reconnect hit targets on the final rendered path endpoints', () => {
    const view = render(<Harness source={{ x: 114, y: 28 }} target={{ x: 640, y: 312 }} />);

    expect(view.container.querySelector('.react-flow__edgeupdater-source')?.getAttribute('cx')).toBe('114');
    expect(view.container.querySelector('.react-flow__edgeupdater-source')?.getAttribute('cy')).toBe('28');
    expect(view.container.querySelector('.react-flow__edgeupdater-target')?.getAttribute('cx')).toBe('640');
    expect(view.container.querySelector('.react-flow__edgeupdater-target')?.getAttribute('cy')).toBe('312');

    view.rerender(<Harness source={{ x: 120, y: 34 }} target={{ x: 630, y: 300 }} />);
    expect(view.container.querySelector('.react-flow__edgeupdater-source')?.getAttribute('cx')).toBe('120');
    expect(view.container.querySelector('.react-flow__edgeupdater-target')?.getAttribute('cy')).toBe('300');
  });

  it('leaves native coordinates unchanged when a routed endpoint is invalid', () => {
    const view = render(
      <Harness source={{ x: Number.NaN, y: 28 }} target={{ x: 640, y: 312 }} />,
    );

    expect(view.container.querySelector('.react-flow__edgeupdater-source')?.getAttribute('cx')).toBe('1');
    expect(view.container.querySelector('.react-flow__edgeupdater-target')?.getAttribute('cx')).toBe('3');
  });
});
