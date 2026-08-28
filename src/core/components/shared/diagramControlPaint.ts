export const waitForDiagramControlViewportPaint = ({
  signal,
  requestAnimationFrameImpl = window.requestAnimationFrame.bind(window),
  cancelAnimationFrameImpl = window.cancelAnimationFrame.bind(window),
  setTimeoutImpl = window.setTimeout.bind(window),
  clearTimeoutImpl = window.clearTimeout.bind(window),
}: {
  signal: AbortSignal;
  requestAnimationFrameImpl?: typeof window.requestAnimationFrame;
  cancelAnimationFrameImpl?: typeof window.cancelAnimationFrame;
  setTimeoutImpl?: (callback: () => void, timeoutMs: number) => number;
  clearTimeoutImpl?: (timeoutId: number) => void;
}): Promise<boolean> => new Promise(resolve => {
  if (signal.aborted) {
    resolve(false);
    return;
  }
  let firstFrame: number | null = null;
  let secondFrame: number | null = null;
  let settled = false;
  const finish = (painted: boolean) => {
    if (settled) return;
    settled = true;
    if (firstFrame !== null) cancelAnimationFrameImpl(firstFrame);
    if (secondFrame !== null) cancelAnimationFrameImpl(secondFrame);
    clearTimeoutImpl(watchdog);
    signal.removeEventListener('abort', onAbort);
    resolve(painted);
  };
  const onAbort = () => finish(false);
  const watchdog = setTimeoutImpl(() => finish(true), 250);
  signal.addEventListener('abort', onAbort, { once: true });
  firstFrame = requestAnimationFrameImpl(() => {
    firstFrame = null;
    secondFrame = requestAnimationFrameImpl(() => finish(true));
  });
});
