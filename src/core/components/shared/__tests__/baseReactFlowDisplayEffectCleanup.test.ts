import { describe, expect, it, vi } from 'vitest';

import { settleBaseReactFlowDisplayEffectCleanup } from '../baseReactFlowDisplayEffectCleanup';

const createCallbacks = () => ({
  abortPendingWork: vi.fn(),
  cancelPendingCacheWrite: vi.fn(),
  cancelGeometrySchedule: vi.fn(),
  recordPendingWorkerCancellation: vi.fn(),
  recordCancelledLifecycle: vi.fn(),
});

describe('display routing effect cleanup', () => {
  it('retains a completed final transaction and its deferred cache write', () => {
    const callbacks = createCallbacks();

    expect(settleBaseReactFlowDisplayEffectCleanup({
      workerStarted: true,
      workerCompleted: true,
      ...callbacks,
    })).toBe('completed-retained');

    expect(callbacks.cancelGeometrySchedule).toHaveBeenCalledOnce();
    expect(callbacks.abortPendingWork).not.toHaveBeenCalled();
    expect(callbacks.cancelPendingCacheWrite).not.toHaveBeenCalled();
    expect(callbacks.recordPendingWorkerCancellation).not.toHaveBeenCalled();
    expect(callbacks.recordCancelledLifecycle).not.toHaveBeenCalled();
  });

  it('aborts and records one pending started transaction', () => {
    const callbacks = createCallbacks();

    expect(settleBaseReactFlowDisplayEffectCleanup({
      workerStarted: true,
      workerCompleted: false,
      ...callbacks,
    })).toBe('pending-cancelled');

    expect(callbacks.abortPendingWork).toHaveBeenCalledOnce();
    expect(callbacks.cancelPendingCacheWrite).toHaveBeenCalledOnce();
    expect(callbacks.recordPendingWorkerCancellation).toHaveBeenCalledOnce();
    expect(callbacks.recordCancelledLifecycle).toHaveBeenCalledOnce();
  });

  it('cancels pre-start scheduling without recording a Worker abort', () => {
    const callbacks = createCallbacks();

    settleBaseReactFlowDisplayEffectCleanup({
      workerStarted: false,
      workerCompleted: false,
      ...callbacks,
    });

    expect(callbacks.abortPendingWork).toHaveBeenCalledOnce();
    expect(callbacks.recordPendingWorkerCancellation).not.toHaveBeenCalled();
    expect(callbacks.recordCancelledLifecycle).toHaveBeenCalledOnce();
  });
});
