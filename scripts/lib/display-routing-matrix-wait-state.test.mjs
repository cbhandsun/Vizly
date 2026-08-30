import { describe, expect, it } from 'vitest';

import {
  displayRoutingWaitStateHasTerminalFailure,
  summarizeDisplayRoutingWaitState,
} from './display-routing-matrix-wait-state.mjs';

describe('display routing matrix wait-state summary', () => {
  it('keeps bounded routing metrics while dropping geometry and user-authored content', () => {
    const summary = summarizeDisplayRoutingWaitState({
      stage: 'worker-response',
      requestId: 'layout:2',
      renderAuthorityStatus: 'accepted',
      stagedLayoutPrimarySignature: '123456',
      stagedLayoutPrimaryGeometryDigest: 'geometry-v1:0123456789abcdef0123456789abcdef',
      layoutSeedTerminalsAttached: false,
      layoutSeedTerminalsAnchored: false,
      layoutSeedObstacleHits: 11,
      layoutSeedStrictCrossings: 59,
      layoutSeedStageAudits: {
        raw: {
          terminalsAttached: true,
          terminalsAnchored: false,
          obstacleHits: 12,
          strictCrossings: 9,
          privateEdgeIds: ['private-edge'],
        },
        final: {
          terminalsAttached: true,
          terminalsAnchored: true,
          obstacleHits: 2,
          strictCrossings: 1,
        },
        privateStage: { userContent: 'private stage content' },
      },
      layoutTransactionJobId: 7,
      layoutTransactionStatus: 'running',
      layoutTransactionAttemptCount: 1,
      workerStartCount: 1,
      userLabel: 'private node name',
      phaseProgressTrace: [{
        phase: 'quality',
        durationMs: 18,
        privateGeometry: [{ x: 1, y: 2 }],
      }],
    }, [{
      requestId: 'route-v2:opaque:4',
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
    }], 26, [{
      requestId: 'layout:2',
      operation: 'incremental-route',
      changeSet: {
        classification: 'geometry',
        reason: 'node-drag',
        changedNodeIds: ['private-node'],
      },
      mutableEdgeIds: ['private-edge'],
      contextEdgeIds: ['private-context-edge'],
      inputSignature: '123456',
      inputGeometryDigest: 'geometry-v1:0123456789abcdef0123456789abcdef',
      nodes: [{ id: 'private-node' }],
      edges: [{ id: 'private-edge' }],
      __browserLayoutSeedAudit: {
        terminalsAttached: true,
        terminalsAnchored: true,
        obstacleHits: 22,
        strictCrossings: 8,
      },
    }]);

    expect(summary).toMatchObject({
      routing: {
        stage: 'worker-response',
        requestId: 'layout:2',
        renderAuthorityStatus: 'accepted',
        requestKind: 'layout',
        stagedLayoutPrimarySignature: '123456',
        stagedLayoutPrimaryGeometryDigest: 'geometry-v1:0123456789abcdef0123456789abcdef',
        layoutSeedTerminalsAttached: false,
        layoutSeedTerminalsAnchored: false,
        layoutSeedObstacleHits: 11,
        layoutSeedStrictCrossings: 59,
        layoutSeedStageAudits: {
          raw: {
            terminalsAttached: true,
            terminalsAnchored: false,
            obstacleHits: 12,
            strictCrossings: 9,
          },
          final: {
            terminalsAttached: true,
            terminalsAnchored: true,
            obstacleHits: 2,
            strictCrossings: 1,
          },
        },
        layoutTransactionJobId: 7,
        layoutTransactionStatus: 'running',
        layoutTransactionAttemptCount: 1,
        workerStartCount: 1,
        phaseProgressTrace: [{ phase: 'quality', durationMs: 18 }],
      },
      responseCount: 1,
      responseTrace: [{
        requestId: 'route-v2:opaque:4',
        requestKind: 'display',
        routeResolution: 'full-route-repaired',
        hardClean: false,
        edgeRouteFingerprint: expect.stringMatching(/^\d+$/),
        edgeObjectFingerprint: expect.stringMatching(/^\d+$/),
      }],
      requestTrace: [{
        requestId: 'layout:2',
        requestKind: 'layout',
        operation: 'incremental-route',
        changeClassification: 'geometry',
        changeReason: 'node-drag',
        changedNodeCount: 1,
        mutableEdgeCount: 1,
        contextEdgeCount: 1,
        inputSignature: '123456',
        inputGeometryDigest: 'geometry-v1:0123456789abcdef0123456789abcdef',
        nodeCount: 1,
        edgeCount: 1,
        layoutSeedAudit: {
          terminalsAttached: true,
          terminalsAnchored: true,
          obstacleHits: 22,
          strictCrossings: 8,
        },
        nodeGeometryFingerprint: expect.stringMatching(/^\d+$/),
        edgeRouteFingerprint: expect.stringMatching(/^\d+$/),
        nodeObjectFingerprint: expect.stringMatching(/^\d+$/),
        edgeObjectFingerprint: expect.stringMatching(/^\d+$/),
      }],
      lastResponse: {
        requestId: 'route-v2:opaque:4',
        requestKind: 'display',
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

  it('keeps the first incremental phases and the latest timeout evidence', () => {
    const progress = Array.from({ length: 80 }, (_, index) => ({
      requestId: 'incremental:1',
      phaseProgress: {
        phase: index === 0 ? 'incremental-closure' : `phase-${index}`,
        durationMs: index,
      },
    }));
    const summary = summarizeDisplayRoutingWaitState({
      phaseProgressTrace: progress.slice(-32).map(item => item.phaseProgress),
    }, progress, 4);

    expect(summary.routing.phaseProgressTrace).toHaveLength(48);
    expect(summary.routing.phaseProgressTrace[0]).toMatchObject({
      phase: 'incremental-closure',
      durationMs: 0,
    });
    expect(summary.routing.phaseProgressTrace.at(-1)).toMatchObject({
      phase: 'phase-79',
      durationMs: 79,
    });
  });

  it('summarizes the latest completed response when progress follows it', () => {
    const summary = summarizeDisplayRoutingWaitState({}, [{
      requestId: 'layout:7',
      hardClean: false,
      hardReport: {
        hardClean: false,
        obstacleHits: 3,
        terminalsAnchored: false,
        quality: { strictCrossings: 2 },
      },
    }, {
      requestId: 'layout:7',
      phaseProgress: { phase: 'finalizer', durationMs: 10 },
    }], 4);

    expect(summary.lastResponse).toMatchObject({
      requestKind: 'layout',
      hardClean: false,
      hardReport: {
        hardClean: false,
        obstacleHits: 3,
        terminalsAnchored: false,
        quality: { strictCrossings: 2 },
      },
    });
    expect(summary.responseTrace).toEqual([expect.objectContaining({
      requestKind: 'layout',
      hardClean: false,
    })]);
  });

  it('recognizes only fail-fast terminal routing states', () => {
    expect(displayRoutingWaitStateHasTerminalFailure({
      routing: { stage: 'worker-timeout' },
    })).toBe(true);
    expect(displayRoutingWaitStateHasTerminalFailure({
      routing: { stage: 'worker-rejected' },
    })).toBe(true);
    expect(displayRoutingWaitStateHasTerminalFailure({
      routing: { stage: 'worker-start' },
    })).toBe(false);
    expect(displayRoutingWaitStateHasTerminalFailure({
      routing: {
        stage: 'final-applied',
        layoutTransactionStatus: 'failed',
        layoutTransactionErrorCode: 'hard-quality-rejected',
      },
    })).toBe(true);
    expect(displayRoutingWaitStateHasTerminalFailure({
      routing: { stage: 'worker-response', layoutTransactionStatus: 'running' },
    })).toBe(false);
    expect(displayRoutingWaitStateHasTerminalFailure({
      routing: { stage: 'final-applied', layoutTransactionStatus: 'committed' },
    })).toBe(false);
    expect(displayRoutingWaitStateHasTerminalFailure({})).toBe(false);
  });
});
