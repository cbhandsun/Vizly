import { describe, expect, it } from 'vitest';

import { summarizeDisplayRoutingWaitState } from './display-routing-matrix-wait-state.mjs';

describe('display routing matrix wait-state summary', () => {
  it('keeps bounded routing metrics while dropping geometry and user-authored content', () => {
    const summary = summarizeDisplayRoutingWaitState({
      stage: 'worker-response',
      workerStartCount: 1,
      userLabel: 'private node name',
    }, [{
      routeResolution: 'full-route-repaired',
      hardClean: false,
      edges: [{ data: { computedPath: [{ x: 1, y: 2 }] }, label: 'private edge label' }],
      hardReport: {
        hardClean: false,
        obstacleHits: 2,
        minimumClearanceViolations: 1,
        minimumClearanceViolationEdgeIds: ['private-edge-id'],
        quality: { strictCrossings: 3, tinyInteriorDoglegs: 1 },
      },
      phaseTrace: [{
        phase: 'strict',
        durationMs: 12.5,
        scannedEdgePairCount: 325,
        debugPath: [{ x: 10, y: 20 }],
      }],
    }], 26);

    expect(summary).toMatchObject({
      routing: { stage: 'worker-response', workerStartCount: 1 },
      responseCount: 1,
      lastResponse: {
        routeResolution: 'full-route-repaired',
        hardClean: false,
        hardReport: {
          obstacleHits: 2,
          minimumClearanceViolations: 1,
          quality: { strictCrossings: 3, tinyInteriorDoglegs: 1 },
        },
        phaseTrace: [{ phase: 'strict', durationMs: 12.5, scannedEdgePairCount: 325 }],
      },
      renderedEdgeCount: 26,
    });
    expect(JSON.stringify(summary)).not.toMatch(/private|computedPath|debugPath|edgeIds/i);
  });

  it('bounds phase history and ignores invalid values', () => {
    const summary = summarizeDisplayRoutingWaitState({}, [{
      phaseTrace: Array.from({ length: 100 }, (_, index) => ({
        phase: index === 99 ? 'finalizer' : `phase-${index}`,
        durationMs: index === 99 ? Number.POSITIVE_INFINITY : index,
      })),
    }], -1);

    expect(summary.lastResponse.phaseTrace).toHaveLength(24);
    expect(summary.lastResponse.phaseTrace.at(-1)).toEqual(expect.objectContaining({
      phase: 'finalizer',
      durationMs: undefined,
    }));
    expect(summary.renderedEdgeCount).toBeUndefined();
  });
});
