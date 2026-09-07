// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEdgeLabelArrangement } from '../useEdgeLabelArrangement';
import type { EdgeLabelArrangementInput } from '../edgeLabelArrangement';

const { state } = vi.hoisted(() => ({ state: { canvas: { getState: () => ({}) } } }));
// React Flow memoizes one wrapper per hook; only its underlying methods are shared.
vi.mock('@xyflow/react', () => ({ useStoreApi: () => {
  const canvas = state.canvas;
  return React.useMemo(() => ({ ...canvas }), [canvas]);
} }));

const input = (y: number): EdgeLabelArrangementInput => ({
  id: 'same', path: [{ x: 0, y }, { x: 300, y }], labelPath: [{ x: 0, y }, { x: 300, y }],
  anchor: { x: 150, y }, preferredCenter: { x: 150, y: y + 30 },
  text: '保留全文', size: { width: 80, height: 24 }, scale: 1, manual: false, obstacles: [],
});
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

describe('useEdgeLabelArrangement', () => {
  it('settles under StrictMode and discards a previous route snapshot during a fast path change', async () => {
    const renders: Array<number | undefined> = [];
    const { result, rerender, unmount } = renderHook(({ y }) => {
      const placement = useEdgeLabelArrangement(input(y));
      renders.push(placement?.anchor.y);
      return placement;
    }, { initialProps: { y: 0 }, wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
    await flush();
    expect(result.current?.anchor.y).toBe(0);
    renders.length = 0;
    rerender({ y: 300 });
    expect(renders).not.toContain(0);
    await flush();
    expect(result.current?.anchor.y).toBe(300);
    expect(renders.length).toBeLessThan(8);
    unmount();
    await flush();
  });

  it('restores manual geometry and independently follows a different canvas with the same edge ID', async () => {
    const firstCanvas = { getState: () => ({}) };
    state.canvas = firstCanvas;
    const { result, rerender, unmount } = renderHook(({ manual, y }) => useEdgeLabelArrangement({
      ...input(y), manual, preferredCenter: { x: 17, y: 29 },
    }), { initialProps: { manual: true, y: 0 } });
    await flush();
    expect(result.current?.center).toEqual({ x: 17, y: 29 });
    state.canvas = { getState: () => ({}) };
    rerender({ manual: false, y: 400 });
    await flush();
    expect(result.current?.anchor.y).toBe(400);
    state.canvas = firstCanvas;
    rerender({ manual: true, y: 0 });
    await flush();
    expect(result.current?.center).toEqual({ x: 17, y: 29 });
    unmount();
    await flush();
  });
});
