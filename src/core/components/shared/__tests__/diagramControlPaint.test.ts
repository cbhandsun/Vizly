import { describe, expect, it, vi } from 'vitest';

import { waitForDiagramControlViewportPaint } from '../diagramControlPaint';

describe('waitForDiagramControlViewportPaint', () => {
  it('waits through two animation frames', async () => {
    const frames: FrameRequestCallback[] = [];
    const controller = new AbortController();
    const result = waitForDiagramControlViewportPaint({
      signal: controller.signal,
      requestAnimationFrameImpl: vi.fn(callback => {
        frames.push(callback);
        return frames.length;
      }),
      cancelAnimationFrameImpl: vi.fn(),
      setTimeoutImpl: vi.fn(() => 1),
      clearTimeoutImpl: vi.fn(),
    });

    frames.shift()?.(0);
    let settled = false;
    void result.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    frames.shift()?.(16);
    await expect(result).resolves.toBe(true);
  });

  it('cancels pending frames when the generation signal aborts', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const result = waitForDiagramControlViewportPaint({
      signal: controller.signal,
      requestAnimationFrameImpl: vi.fn(() => 7),
      cancelAnimationFrameImpl: cancel,
      setTimeoutImpl: vi.fn(() => 1),
      clearTimeoutImpl: vi.fn(),
    });

    controller.abort();

    await expect(result).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledWith(7);
  });
});
