// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { scheduleBaseReactFlowStableGeometry } from '../baseReactFlowDisplayGeometryBarrier';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('baseReactFlowDisplayGeometryBarrier', () => {
  it('starts at the stable two-frame barrier and reports bounded evidence', () => {
    vi.useFakeTimers();
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const run = vi.fn();
    let identity = 'signature-a\0geometry-a';

    scheduleBaseReactFlowStableGeometry({
      run,
      readGeometryIdentity: () => identity,
      minimumStableMs: 0,
    });
    callbacks.shift()?.(16);
    expect(run).not.toHaveBeenCalled();
    identity = 'signature-a\0geometry-b';
    callbacks.shift()?.(32);
    expect(run).not.toHaveBeenCalled();
    callbacks.shift()?.(48);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      resolution: 'stable',
      sampleCount: 3,
    }));
  });

  it('does not accept a short-lived two-frame plateau before the quiet window', () => {
    vi.useFakeTimers();
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const run = vi.fn();

    scheduleBaseReactFlowStableGeometry({
      run,
      readGeometryIdentity: () => 'stable',
      minimumStableMs: 96,
    });
    callbacks.shift()?.(16);
    callbacks.shift()?.(32);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(96);
    callbacks.shift()?.(112);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      resolution: 'stable',
      sampleCount: 3,
    }));
  });

  it('uses a bounded timeout and supports cancellation', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 41);
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const timedOutRun = vi.fn();
    scheduleBaseReactFlowStableGeometry({
      run: timedOutRun,
      readGeometryIdentity: () => null,
      maximumWaitMs: Number.NaN,
    });
    vi.advanceTimersByTime(319);
    expect(timedOutRun).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(timedOutRun).toHaveBeenCalledWith(expect.objectContaining({
      resolution: 'timed-out',
      sampleCount: 0,
    }));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);

    const cancelledRun = vi.fn();
    const cancel = scheduleBaseReactFlowStableGeometry({
      run: cancelledRun,
      readGeometryIdentity: () => 'stable',
      maximumWaitMs: 10_000,
    });
    cancel();
    vi.advanceTimersByTime(1_000);
    expect(cancelledRun).not.toHaveBeenCalled();
  });
});
