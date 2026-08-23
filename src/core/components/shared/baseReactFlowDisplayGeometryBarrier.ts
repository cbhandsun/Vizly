export type DisplayGeometryBarrierResolution = 'stable' | 'timed-out';

export type DisplayGeometryBarrierResult = Readonly<{
  resolution: DisplayGeometryBarrierResolution;
  durationMs: number;
  sampleCount: number;
}>;

type CancelDisplayGeometryBarrier = () => void;

const DEFAULT_MAXIMUM_WAIT_MS = 320;
const DEFAULT_MINIMUM_STABLE_MS = 96;

export const resolveDisplayGeometryBarrierPolicy = (
  incremental: boolean,
): Readonly<{
  minimumStableMs?: number;
  sampleIncrementalMicrotask?: boolean;
  waitForFonts: boolean;
}> => incremental
  ? { minimumStableMs: 0, sampleIncrementalMicrotask: true, waitForFonts: false }
  : { waitForFonts: true };

const readSafeIdentity = (readGeometryIdentity: () => string | null): string | null => {
  try {
    const identity = readGeometryIdentity();
    return typeof identity === 'string' && identity.length > 0 && identity.length <= 512
      ? identity
      : null;
  } catch {
    return null;
  }
};

/**
 * Starts routing as soon as measured geometry is identical when sampled after
 * fonts settle and again on the next observation. Released node drags may use
 * one microtask observation because their position/digest belongs to the
 * already committed React state; a mismatch falls back to frame sampling. A
 * bounded timeout preserves liveness when fonts, ResizeObserver, or layout
 * never become perfectly stable.
 */
export const scheduleBaseReactFlowStableGeometry = ({
  run,
  readGeometryIdentity,
  maximumWaitMs = DEFAULT_MAXIMUM_WAIT_MS,
  minimumStableMs = DEFAULT_MINIMUM_STABLE_MS,
  sampleIncrementalMicrotask = false,
  waitForFonts = true,
}: {
  run: (result: DisplayGeometryBarrierResult) => void;
  readGeometryIdentity: () => string | null;
  maximumWaitMs?: number;
  minimumStableMs?: number;
  sampleIncrementalMicrotask?: boolean;
  waitForFonts?: boolean;
}): CancelDisplayGeometryBarrier => {
  if (typeof window === 'undefined') return () => {};
  const safeMaximumWaitMs = Number.isFinite(maximumWaitMs)
    ? Math.max(16, Math.min(1_000, Math.round(maximumWaitMs)))
    : DEFAULT_MAXIMUM_WAIT_MS;
  const safeMinimumStableMs = Number.isFinite(minimumStableMs)
    ? Math.max(0, Math.min(250, Math.round(minimumStableMs)))
    : DEFAULT_MINIMUM_STABLE_MS;
  const startedAt = Date.now();
  let cancelled = false;
  let completed = false;
  let frameHandle: number | null = null;
  let previousIdentity: string | null = null;
  let sampleCount = 0;
  let microtaskSampleUsed = false;
  const requestFrame = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : null;
  const cancelFrame = typeof window.cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame.bind(window)
    : null;

  const finish = (resolution: DisplayGeometryBarrierResolution): void => {
    if (cancelled || completed) return;
    completed = true;
    if (frameHandle !== null) cancelFrame?.(frameHandle);
    window.clearTimeout(timeoutHandle);
    run({
      resolution,
      durationMs: Math.max(0, Date.now() - startedAt),
      sampleCount,
    });
  };

  const observeIdentity = (): void => {
    if (cancelled || completed) return;
    const currentIdentity = readSafeIdentity(readGeometryIdentity);
    sampleCount += 1;
    if (
      currentIdentity
      && currentIdentity === previousIdentity
      && Date.now() - startedAt >= safeMinimumStableMs
    ) {
      finish('stable');
      return;
    }
    previousIdentity = currentIdentity;
    sampleNextObservation();
  };

  const sampleNextObservation = (): void => {
    if (cancelled || completed) return;
    if (sampleIncrementalMicrotask && !microtaskSampleUsed) {
      microtaskSampleUsed = true;
      queueMicrotask(observeIdentity);
      return;
    }
    if (!requestFrame) return;
    frameHandle = requestFrame(() => {
      frameHandle = null;
      observeIdentity();
    });
  };

  const timeoutHandle = window.setTimeout(
    () => finish('timed-out'),
    safeMaximumWaitMs,
  );
  const fontSet = !waitForFonts || typeof document === 'undefined'
    ? null
    : (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  const beginSampling = (): void => {
    if (cancelled || completed) return;
    previousIdentity = readSafeIdentity(readGeometryIdentity);
    sampleCount += 1;
    sampleNextObservation();
  };
  if (fontSet?.ready && typeof fontSet.ready.then === 'function') {
    void fontSet.ready.then(beginSampling, beginSampling);
  } else {
    beginSampling();
  }

  return () => {
    cancelled = true;
    if (frameHandle !== null) cancelFrame?.(frameHandle);
    window.clearTimeout(timeoutHandle);
  };
};
