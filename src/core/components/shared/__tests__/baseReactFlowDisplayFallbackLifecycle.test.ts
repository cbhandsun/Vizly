import { describe, expect, it } from 'vitest';

import {
  createBaseReactFlowInteractiveFallbackEdges,
  createBaseReactFlowNodeDragFallbackEdges,
  resolveBaseReactFlowNodeDragFallbackIds,
  shouldUseBaseReactFlowNodeDragFallback,
} from '../baseReactFlowDisplayFallback';
import {
  computeBaseReactFlowDisplayCacheSignature,
} from '../baseReactFlowDisplayEdgeCore';
import {
  computeBaseReactFlowDisplayGeometryDigest,
  computeBaseReactFlowDisplayInputIdentityBundle,
} from '../baseReactFlowDisplayInputIdentity';
import {
  canCommitBaseReactFlowDisplayResult,
  shouldRepairBaseReactFlowDisplayResult,
} from '../baseReactFlowDisplayCommitPolicy';
import { resolveDisplayRoutingCommittedReuseTiming } from '../baseReactFlowDisplayRoutingDebug';

describe('baseReactFlow display fallback lifecycle', () => {
  it('uses lightweight built-in paths for smart edges during interactive fallback', () => {
    const plain = { id: 'plain', source: 'source', target: 'target', type: 'straight' };
    const smart = { id: 'smart', source: 'source', target: 'target', type: 'advanced-smart-step' };
    const inheritedSmart = { id: 'inherited-smart', source: 'source', target: 'target' };
    const input = [plain, smart, inheritedSmart];
    const fallback = createBaseReactFlowInteractiveFallbackEdges(input);

    expect(fallback).not.toBe(input);
    expect(fallback[0]).toBe(plain);
    expect(fallback[1]).toEqual({ ...smart, type: 'smoothstep' });
    expect(fallback[2]).toEqual({ ...inheritedSmart, type: 'smoothstep' });
    expect(createBaseReactFlowInteractiveFallbackEdges([plain])[0]).toBe(plain);
  });

  it('computes cache and collision identities in one equivalent traversal', () => {
    const input = {
      nodes: [
        {
          id: 'source',
          type: 'flowchart',
          position: { x: 10.25, y: 20.5 },
          measured: { width: 120, height: 48 },
          data: { layoutDirection: 'LR' },
        },
        {
          id: 'target',
          type: 'flowchart',
          position: { x: 320, y: 120 },
          measured: { width: 140, height: 56 },
          data: {},
        },
      ],
      edges: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        type: 'stablePath',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: {
          computedPath: [
            { x: 130, y: 44 },
            { x: 220, y: 44 },
            { x: 220, y: 148 },
            { x: 320, y: 148 },
          ],
        },
      }],
      enableSmartEdges: true,
      smartEdgePadding: 18,
      isLargeGraph: true,
    };

    expect(computeBaseReactFlowDisplayInputIdentityBundle(input)).toEqual({
      cacheSignature: computeBaseReactFlowDisplayCacheSignature(input),
      geometryDigest: computeBaseReactFlowDisplayGeometryDigest(input),
    });
  });

  it('uses endpoint-driven fallback for stable routes during node dragging', () => {
    const stable = {
      id: 'stable',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    };
    const plain = { id: 'plain', source: 'source', target: 'target', type: 'straight' };

    const fallback = createBaseReactFlowNodeDragFallbackEdges([stable, plain]);

    expect(fallback[0]).toEqual({ ...stable, type: 'smoothstep' });
    expect(fallback[1]).toBe(plain);
  });

  it('limits drag fallback conversion to edges touching the dragged nodes', () => {
    const incident = {
      id: 'incident', source: 'dragged', target: 'target', type: 'advanced-smart',
    };
    const unrelated = {
      id: 'unrelated', source: 'other-source', target: 'other-target', type: 'advanced-smart',
    };

    const fallback = createBaseReactFlowNodeDragFallbackEdges(
      [incident, unrelated],
      ['dragged'],
    );

    expect(fallback[0]).toEqual({ ...incident, type: 'smoothstep' });
    expect(fallback[1]).toBe(unrelated);
  });

  it('ignores unselected descendants when resolving drag fallback nodes', () => {
    expect(resolveBaseReactFlowNodeDragFallbackIds('primary', [
      { id: 'primary', selected: true },
      { id: 'selected-peer', selected: true },
      { id: 'unselected-descendant', selected: false },
    ])).toEqual(['primary', 'selected-peer']);
  });

  it('keeps drag fallback visible throughout dragging and pending rerouting', () => {
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: true,
      dragFallbackPending: false,
      hasResolvedEdges: false,
      sourceEdgeCount: 4,
    })).toBe(true);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: false,
      dragFallbackPending: true,
      hasResolvedEdges: false,
      sourceEdgeCount: 4,
    })).toBe(true);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: false,
      dragFallbackPending: true,
      hasResolvedEdges: true,
      sourceEdgeCount: 4,
    })).toBe(true);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: true,
      dragFallbackPending: false,
      hasResolvedEdges: true,
      sourceEdgeCount: 4,
    })).toBe(true);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: false,
      dragFallbackPending: false,
      hasResolvedEdges: true,
      sourceEdgeCount: 4,
    })).toBe(false);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: true,
      dragFallbackPending: true,
      hasResolvedEdges: false,
      sourceEdgeCount: 0,
    })).toBe(false);
  });

  it('rejects every non-hard-clean result regardless of interactive mode', () => {
    expect(shouldRepairBaseReactFlowDisplayResult({
      qualityMode: 'interactive',
      hardClean: false,
    })).toBe(true);
    expect(shouldRepairBaseReactFlowDisplayResult({
      qualityMode: 'full',
      hardClean: false,
    })).toBe(true);
    expect(canCommitBaseReactFlowDisplayResult({
      qualityMode: 'interactive',
      hardClean: false,
      routeResolution: 'full-route',
      routesMatch: true,
    })).toBe(false);
    expect(canCommitBaseReactFlowDisplayResult({
      qualityMode: 'interactive',
      hardClean: false,
      routeResolution: 'full-route',
      routesMatch: false,
    })).toBe(false);
  });

  it('preserves measured route timing when the committed render reuses the exact route', () => {
    const current = {
      stage: 'final-applied',
      signature: 'input-1',
      inputGeometryDigest: 'geometry-1',
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      scheduledAt: 100,
      workerStartedAt: 180,
      finalAppliedAt: 620,
      routeMs: 440,
      totalRouteMs: 520,
    };

    expect(resolveDisplayRoutingCommittedReuseTiming({
      current,
      signature: 'input-1',
      inputGeometryDigest: 'geometry-1',
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      now: 900,
    })).toMatchObject({
      scheduledAt: 100,
      workerStartedAt: 180,
      finalAppliedAt: 620,
      routeMs: 440,
      totalRouteMs: 520,
    });

    expect(resolveDisplayRoutingCommittedReuseTiming({
      current,
      signature: 'input-2',
      inputGeometryDigest: 'geometry-2',
      outputRouteSignature: 'route-v2:1:2:fedcba9876543210',
      now: 900,
    })).toEqual({
      scheduledAt: undefined,
      workerStartedAt: undefined,
      finalAppliedAt: 900,
      routeMs: undefined,
      totalRouteMs: undefined,
      phaseTrace: undefined,
      workerResolution: undefined,
      hardGateDiagnostics: undefined,
    });
  });
});
