import { describe, expect, it, vi } from 'vitest';

import {
  hasBaseReactFlowRenderableSize,
  scheduleBaseReactFlowContainerReadyUpdate,
} from '../baseReactFlowContainerReady';

describe('baseReactFlowContainerReady', () => {
  it('treats either measured container size or live rect size as renderable', () => {
    expect(hasBaseReactFlowRenderableSize({
      containerSize: { width: 100, height: 0 },
      liveRect: null,
    })).toBe(false);

    expect(hasBaseReactFlowRenderableSize({
      containerSize: { width: 100, height: 50 },
      liveRect: null,
    })).toBe(true);

    expect(hasBaseReactFlowRenderableSize({
      containerSize: { width: 0, height: 0 },
      liveRect: { width: 80, height: 40 } as DOMRect,
    })).toBe(true);
  });

  it('schedules a ready update only when the container is not already ready', () => {
    const setIsContainerReady = vi.fn();
    const setTimeoutImpl = vi.fn((handler: TimerHandler) => {
      (handler as () => void)();
      return 7;
    });

    expect(scheduleBaseReactFlowContainerReadyUpdate({
      hasRenderableSize: true,
      isContainerReady: false,
      setIsContainerReady,
      setTimeoutImpl,
    })).toBe(7);
    expect(setIsContainerReady).toHaveBeenCalledWith(true);

    setIsContainerReady.mockReset();
    setTimeoutImpl.mockClear();

    expect(scheduleBaseReactFlowContainerReadyUpdate({
      hasRenderableSize: true,
      isContainerReady: true,
      setIsContainerReady,
      setTimeoutImpl,
    })).toBeNull();
    expect(setIsContainerReady).not.toHaveBeenCalled();
  });

  it('preserves irreversible ready state by skipping false transitions after ready', () => {
    const setIsContainerReady = vi.fn();
    const setTimeoutImpl = vi.fn((handler: TimerHandler) => {
      (handler as () => void)();
      return 9;
    });

    expect(scheduleBaseReactFlowContainerReadyUpdate({
      hasRenderableSize: false,
      isContainerReady: false,
      setIsContainerReady,
      setTimeoutImpl,
    })).toBe(9);
    expect(setIsContainerReady).toHaveBeenCalledWith(false);

    setIsContainerReady.mockReset();
    setTimeoutImpl.mockClear();

    expect(scheduleBaseReactFlowContainerReadyUpdate({
      hasRenderableSize: false,
      isContainerReady: true,
      setIsContainerReady,
      setTimeoutImpl,
    })).toBeNull();
    expect(setIsContainerReady).not.toHaveBeenCalled();
  });
});
