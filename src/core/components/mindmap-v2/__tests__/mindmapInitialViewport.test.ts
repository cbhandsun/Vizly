import { describe, expect, it, vi } from 'vitest';

import {
  scheduleMindMapInitialViewport,
  type MindMapViewportSize,
} from '../mindmapInitialViewport';

const createFrameHarness = () => {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const handle = nextHandle++;
    callbacks.set(handle, callback);
    return handle;
  });
  const cancelFrame = vi.fn((handle: number) => callbacks.delete(handle));
  const runNextFrame = () => {
    const first = callbacks.entries().next();
    if (first.done) return false;
    const [handle, callback] = first.value;
    callbacks.delete(handle);
    callback(0);
    return true;
  };
  return { requestFrame, cancelFrame, runNextFrame, callbacks };
};

describe('scheduleMindMapInitialViewport', () => {
  it('fits once after a positive viewport size is stable across two frames', () => {
    const frames = createFrameHarness();
    const applyFit = vi.fn();
    scheduleMindMapInitialViewport({
      measure: () => ({ width: 406, height: 712 }),
      applyFit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });

    expect(frames.runNextFrame()).toBe(true);
    expect(applyFit).not.toHaveBeenCalled();
    expect(frames.runNextFrame()).toBe(true);
    expect(applyFit).toHaveBeenCalledTimes(1);
    expect(frames.callbacks.size).toBe(0);
  });

  it('waits for an empty or changing viewport to become stable', () => {
    const frames = createFrameHarness();
    const applyFit = vi.fn();
    const sizes: MindMapViewportSize[] = [
      { width: 0, height: 0 },
      { width: 320, height: 600 },
      { width: 406, height: 712 },
      { width: 406, height: 712 },
    ];
    scheduleMindMapInitialViewport({
      measure: () => sizes.shift() ?? { width: 406, height: 712 },
      applyFit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });

    while (frames.runNextFrame() && applyFit.mock.calls.length === 0) {
      // Drain until the viewport stabilizes.
    }
    expect(applyFit).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid measurements and stops at the bounded frame limit', () => {
    const frames = createFrameHarness();
    const applyFit = vi.fn();
    scheduleMindMapInitialViewport({
      measure: () => ({ width: Number.POSITIVE_INFINITY, height: -1 }),
      applyFit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      maxFrames: 3,
    });

    while (frames.runNextFrame()) {
      // Drain the bounded scheduler.
    }
    expect(applyFit).not.toHaveBeenCalled();
    expect(frames.requestFrame).toHaveBeenCalledTimes(3);
  });

  it('cancels a pending fit without applying it', () => {
    const frames = createFrameHarness();
    const applyFit = vi.fn();
    const cancel = scheduleMindMapInitialViewport({
      measure: () => ({ width: 406, height: 712 }),
      applyFit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });

    cancel();
    expect(frames.cancelFrame).toHaveBeenCalledTimes(1);
    expect(frames.runNextFrame()).toBe(false);
    expect(applyFit).not.toHaveBeenCalled();
  });

  it('reports measurement, scheduling, and fit failures', () => {
    const failures = [
      new Error('measurement failed'),
      new Error('scheduling failed'),
      new Error('fit failed'),
    ];
    const onFailure = vi.fn();
    const immediateFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };

    scheduleMindMapInitialViewport({
      measure: () => { throw failures[0]; },
      applyFit: vi.fn(),
      requestFrame: immediateFrame,
      cancelFrame: vi.fn(),
      onFailure,
    });
    scheduleMindMapInitialViewport({
      measure: vi.fn(),
      applyFit: vi.fn(),
      requestFrame: () => { throw failures[1]; },
      cancelFrame: vi.fn(),
      onFailure,
    });

    const frames = createFrameHarness();
    scheduleMindMapInitialViewport({
      measure: () => ({ width: 406, height: 712 }),
      applyFit: () => { throw failures[2]; },
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      onFailure,
    });
    frames.runNextFrame();
    frames.runNextFrame();

    failures.forEach((failure, index) => {
      expect(onFailure).toHaveBeenNthCalledWith(index + 1, failure);
    });
  });
});
