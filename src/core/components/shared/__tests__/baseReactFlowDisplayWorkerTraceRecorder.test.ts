import { describe, expect, it, vi } from 'vitest';

import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import {
  createDisplayRoutingPhaseRecorder,
  shouldPublishDisplayRoutingPhaseProgress,
} from '../baseReactFlowDisplayWorkerTraceRecorder';

describe('display Worker trace recorder', () => {
  it('can publish bounded incremental phase progress without graph payloads', () => {
    const phaseTrace: DisplayRoutingPhaseTrace[] = [];
    const publish = vi.fn();
    const record = createDisplayRoutingPhaseRecorder({
      requestId: 'incremental-1',
      phaseTrace,
      publish,
      publishProgress: true,
    });
    const trace: DisplayRoutingPhaseTrace = {
      phase: 'local-route',
      durationMs: 12,
      candidateCount: 4,
      changedEdgeCount: 4,
      resolution: 'accepted',
    };
    record(trace);

    expect(phaseTrace).toEqual([trace]);
    expect(publish).toHaveBeenCalledWith({
      requestId: 'incremental-1',
      phaseProgress: trace,
    });
  });

  it('aggregates repeated phase work before applying the bounded trace limit', () => {
    const phaseTrace: DisplayRoutingPhaseTrace[] = [];
    const record = createDisplayRoutingPhaseRecorder({
      requestId: 'aggregate-trace',
      phaseTrace,
      publish: vi.fn(),
      publishProgress: false,
    });
    record({
      phase: 'residual-micro-derivative',
      parentPhase: 'quality-polish-residual',
      durationMs: 20,
      candidateCount: 12,
      changedEdgeCount: 1,
      cacheHitCount: 5,
      scannedSegmentCount: 80,
      resolution: 'skip',
    });
    record({
      phase: 'residual-micro-derivative',
      parentPhase: 'quality-polish-residual',
      durationMs: 30,
      candidateCount: 8,
      changedEdgeCount: 2,
      cacheHitCount: 7,
      scannedSegmentCount: 40,
      resolution: 'accepted',
    });

    expect(phaseTrace).toEqual([expect.objectContaining({
      durationMs: 50,
      candidateCount: 20,
      changedEdgeCount: 3,
      cacheHitCount: 12,
      scannedSegmentCount: 120,
      resolution: 'accepted',
    })]);
  });

  it('publishes milestones and slow or failed nested phases without flooding progress', () => {
    const nested = (durationMs: number, resolution: DisplayRoutingPhaseTrace['resolution']) => ({
      phase: 'quality-polish-local' as const,
      parentPhase: 'quality-polish' as const,
      durationMs,
      candidateCount: 4,
      changedEdgeCount: 0,
      resolution,
    });

    expect(shouldPublishDisplayRoutingPhaseProgress({
      ...nested(1, 'skip'),
      phase: 'quality',
      parentPhase: undefined,
    })).toBe(true);
    expect(shouldPublishDisplayRoutingPhaseProgress(nested(24.9, 'skip'))).toBe(false);
    expect(shouldPublishDisplayRoutingPhaseProgress(nested(25, 'accepted'))).toBe(true);
    expect(shouldPublishDisplayRoutingPhaseProgress(nested(1, 'rejected'))).toBe(true);
    expect(shouldPublishDisplayRoutingPhaseProgress(nested(1, 'fallback'))).toBe(true);

    const phaseTrace: DisplayRoutingPhaseTrace[] = [];
    const publish = vi.fn();
    const record = createDisplayRoutingPhaseRecorder({
      requestId: 'bounded-progress',
      phaseTrace,
      publish,
    });
    record(nested(5, 'skip'));
    record(nested(30, 'accepted'));

    expect(phaseTrace).toHaveLength(1);
    expect(phaseTrace[0]?.durationMs).toBe(35);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      requestId: 'bounded-progress',
      phaseProgress: nested(30, 'accepted'),
    });
  });
});
