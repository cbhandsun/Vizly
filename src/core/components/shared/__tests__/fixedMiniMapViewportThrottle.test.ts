import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFixedMiniMapViewportThrottle } from '../fixedMiniMapViewportThrottle';

describe('createFixedMiniMapViewportThrottle', () => {
  afterEach(() => vi.useRealTimers());

  it('publishes the first viewport immediately and coalesces a burst to the latest value', () => {
    vi.useFakeTimers();
    let currentTime = 0;
    const publish = vi.fn();
    const throttle = createFixedMiniMapViewportThrottle(publish, 50, () => currentTime);
    const first = { x: 1, y: 2, zoom: 1 };
    const second = { x: 3, y: 4, zoom: 0.8 };
    const latest = { x: 5, y: 6, zoom: 0.6 };

    throttle.push(first);
    currentTime = 10;
    throttle.push(second);
    currentTime = 20;
    throttle.push(latest);

    expect(publish).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(40);
    expect(publish).toHaveBeenLastCalledWith(latest);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending trailing update when disposed', () => {
    vi.useFakeTimers();
    let currentTime = 0;
    const publish = vi.fn();
    const throttle = createFixedMiniMapViewportThrottle(publish, 50, () => currentTime);

    throttle.push({ x: 1, y: 2, zoom: 1 });
    currentTime = 10;
    throttle.push({ x: 3, y: 4, zoom: 0.8 });
    throttle.dispose();
    vi.runAllTimers();

    expect(publish).toHaveBeenCalledTimes(1);
  });
});
