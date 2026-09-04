// @vitest-environment jsdom

import { createElement, StrictMode, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useBaseReactFlowRoutingSessionRuntime } from '../baseReactFlowRoutingSessionRuntime';

const StrictModeWrapper = ({ children }: { children: ReactNode }) => (
  createElement(StrictMode, null, children)
);

describe('useBaseReactFlowRoutingSessionRuntime', () => {
  it('keeps its runtime usable across the Strict Mode effect replay', () => {
    const { result } = renderHook(
      () => useBaseReactFlowRoutingSessionRuntime(),
      { wrapper: StrictModeWrapper },
    );

    const job = result.current.beginJob('display');

    expect(result.current.isCurrentJob(job)).toBe(true);
  });

  it('disposes its runtime after a real unmount', async () => {
    const { result, unmount } = renderHook(() => useBaseReactFlowRoutingSessionRuntime());
    const runtime = result.current;

    unmount();
    await Promise.resolve();

    expect(() => runtime.beginJob('display')).toThrow('routing-session-runtime-disposed');
  });
});
