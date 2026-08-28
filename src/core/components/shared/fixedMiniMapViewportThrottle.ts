import type { Viewport } from './viewportStore';

export const MINIMAP_VIEWPORT_UPDATE_INTERVAL_MS = 50;

type TimeoutHandle = ReturnType<typeof setTimeout>;

export const createFixedMiniMapViewportThrottle = (
  publish: (viewport: Viewport) => void,
  intervalMs = MINIMAP_VIEWPORT_UPDATE_INTERVAL_MS,
  now: () => number = () => performance.now(),
) => {
  let lastPublishedAt = Number.NEGATIVE_INFINITY;
  let pendingViewport: Viewport | null = null;
  let pendingTimeout: TimeoutHandle | null = null;
  let disposed = false;

  const flush = () => {
    pendingTimeout = null;
    if (disposed || !pendingViewport) return;
    const viewport = pendingViewport;
    pendingViewport = null;
    lastPublishedAt = now();
    publish(viewport);
  };

  return {
    push(viewport: Viewport) {
      if (disposed) return;
      const elapsed = now() - lastPublishedAt;
      if (pendingTimeout === null && elapsed >= intervalMs) {
        lastPublishedAt = now();
        publish(viewport);
        return;
      }
      pendingViewport = viewport;
      if (pendingTimeout === null) {
        pendingTimeout = setTimeout(flush, Math.max(0, intervalMs - elapsed));
      }
    },
    dispose() {
      disposed = true;
      pendingViewport = null;
      if (pendingTimeout !== null) clearTimeout(pendingTimeout);
      pendingTimeout = null;
    },
  };
};
