// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasViewportReadiness } from '../useCanvasViewportReadiness';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
const paint = () => act(() => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(0));
});
beforeEach(() => {
  frames = new Map(); nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback); return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('viewport readiness lifecycle', () => {
  it('waits for actual geometry and stops frame polling when ready', () => {
    let snapshot: unknown = { nodes: [] };
    const readSnapshot = () => snapshot;
    const readBridge = () => null;
    const hook = renderHook(() => useCanvasViewportReadiness('doc', readSnapshot, readBridge));
    paint(); expect(hook.result.current).toBe(false); expect(frames.size).toBe(1);
    snapshot = { nodes: [{ measured: { width: 80, height: 40 } }] };
    paint(); expect(hook.result.current).toBe(true); expect(frames.size).toBe(0);
    hook.unmount(); expect(frames.size).toBe(0);
  });
  it('does not carry readiness from one document into another', () => {
    const readSnapshot = () => ({ nodes: [{ width: 80, height: 40 }] });
    const readBridge = () => null;
    const hook = renderHook(({ id }) => useCanvasViewportReadiness(id, readSnapshot, readBridge), { initialProps: { id: 'first' } });
    paint(); expect(hook.result.current).toBe(true);
    hook.rerender({ id: 'second' }); expect(hook.result.current).toBe(false);
    paint(); expect(hook.result.current).toBe(true);
  });
  it('rechecks loaded empty canvases on DOM commits and cancels pending frames on unmount', async () => {
    let snapshot: unknown = { nodes: [] };
    const readSnapshot = () => snapshot;
    const readBridge = () => ({ isCanvasReady: () => true });
    const hook = renderHook(() => useCanvasViewportReadiness('doc', readSnapshot, readBridge));
    paint(); expect(hook.result.current).toBe(false); expect(frames.size).toBe(0);
    snapshot = { nodes: [{ width: 80, height: 40 }] };
    await act(async () => { document.body.appendChild(document.createElement('span')); });
    expect(frames.size).toBe(1); paint(); expect(hook.result.current).toBe(true);
    await act(async () => { document.body.appendChild(document.createElement('span')); });
    hook.unmount(); expect(frames.size).toBe(0);
  });
});
