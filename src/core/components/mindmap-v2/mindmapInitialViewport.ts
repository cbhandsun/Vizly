export interface MindMapViewportSize {
  width: number;
  height: number;
}

interface ScheduleMindMapInitialViewportOptions {
  measure: () => MindMapViewportSize;
  applyFit: () => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  onFailure?: (error: unknown) => void;
  maxFrames?: number;
}

const DEFAULT_MAX_FRAMES = 12;

const isUsableViewportSize = (size: MindMapViewportSize): boolean =>
  Number.isFinite(size.width)
  && Number.isFinite(size.height)
  && size.width > 0
  && size.height > 0;

const hasStableViewportSize = (
  previous: MindMapViewportSize | null,
  current: MindMapViewportSize,
): boolean => previous !== null
  && previous.width === current.width
  && previous.height === current.height;

export const scheduleMindMapInitialViewport = ({
  measure,
  applyFit,
  requestFrame = callback => window.requestAnimationFrame(callback),
  cancelFrame = handle => window.cancelAnimationFrame(handle),
  onFailure,
  maxFrames = DEFAULT_MAX_FRAMES,
}: ScheduleMindMapInitialViewportOptions): (() => void) => {
  const safeMaxFrames = Number.isInteger(maxFrames) && maxFrames > 1
    ? Math.min(maxFrames, 60)
    : DEFAULT_MAX_FRAMES;
  let frameHandle: number | null = null;
  let frameCount = 0;
  let previousSize: MindMapViewportSize | null = null;
  let cancelled = false;

  const fail = (error: unknown) => {
    onFailure?.(error);
  };

  const scheduleNextFrame = () => {
    try {
      frameHandle = requestFrame(runFrame);
    } catch (error) {
      frameHandle = null;
      fail(error);
    }
  };

  const runFrame: FrameRequestCallback = () => {
    frameHandle = null;
    if (cancelled) return;
    frameCount += 1;

    let currentSize: MindMapViewportSize;
    try {
      currentSize = measure();
    } catch (error) {
      fail(error);
      return;
    }

    const usable = isUsableViewportSize(currentSize);
    const stable = usable && hasStableViewportSize(previousSize, currentSize);
    if (usable) previousSize = currentSize;
    else previousSize = null;

    if (stable || (usable && frameCount >= safeMaxFrames)) {
      try {
        applyFit();
      } catch (error) {
        fail(error);
      }
      return;
    }

    if (frameCount < safeMaxFrames) scheduleNextFrame();
  };

  scheduleNextFrame();

  return () => {
    cancelled = true;
    if (frameHandle === null) return;
    cancelFrame(frameHandle);
    frameHandle = null;
  };
};
