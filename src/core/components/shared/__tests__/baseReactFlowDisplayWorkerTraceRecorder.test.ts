import { describe, expect, it, vi } from 'vitest';

import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import { createDisplayRoutingPhaseRecorder } from '../baseReactFlowDisplayWorkerTraceRecorder';

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
});
