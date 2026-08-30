import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import {
  createBaseReactFlowFinalSafetyNoopCache,
  createBaseReactFlowFinalSafetyNoopCacheKey,
} from '../baseReactFlowDisplayFinalSafetyNoopCache';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { auditBaseReactFlowFinalSafetyClosure } from '../baseReactFlowDisplayFinalSafetyAudit';
import { repairBaseReactFlowFinalSafetyClosure } from '../baseReactFlowDisplayFinalSafetyClosure';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';

const edges = (): Edge[] => [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'stablePath',
  data: { computedPath: [{ x: 100, y: 40 }, { x: 300, y: 40 }] },
}];

const nodes = (): Node[] => [
  { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 80, data: {} },
  { id: 'target', position: { x: 300, y: 0 }, width: 100, height: 80, data: {} },
];

describe('baseReactFlow final safety no-op cache', () => {
  it('hits only for exact route, obstacle, and eligibility identities', () => {
    const cache = createBaseReactFlowFinalSafetyNoopCache();
    const baselineEdges = edges();
    const baselineNodes = nodes();
    const eligible = new Set(['edge']);

    expect(cache.has(baselineEdges, baselineNodes, eligible)).toBe(false);
    expect(cache.remember(baselineEdges, baselineNodes, eligible)).toBe(true);
    expect(cache.has(edges(), nodes(), new Set(['edge']))).toBe(true);

    const changedRoute = edges();
    changedRoute[0] = {
      ...changedRoute[0],
      data: { computedPath: [{ x: 100, y: 40 }, { x: 240, y: 40 }, { x: 240, y: 80 }] },
    };
    expect(cache.has(changedRoute, nodes(), eligible)).toBe(false);

    const changedNodes = nodes();
    changedNodes[1] = { ...changedNodes[1], position: { x: 320, y: 0 } };
    expect(cache.has(edges(), changedNodes, eligible)).toBe(false);
    expect(cache.has(edges(), nodes(), new Set())).toBe(false);
    expect(cache.has(edges(), nodes())).toBe(false);
  });

  it('fails closed for invalid routes and overlong eligible identifiers', () => {
    const cache = createBaseReactFlowFinalSafetyNoopCache();
    const invalidEdges = edges();
    invalidEdges[0] = { ...invalidEdges[0], data: { computedPath: [{ x: 0, y: 0 }] } };
    expect(createBaseReactFlowFinalSafetyNoopCacheKey(invalidEdges, nodes())).toBeNull();
    expect(cache.remember(invalidEdges, nodes())).toBe(false);
    expect(cache.remember(edges(), nodes(), new Set(['x'.repeat(501)]))).toBe(false);
  });

  it('reuses an exact no-op only inside the same request evaluation session', () => {
    const baselineNodes = nodes();
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(baselineNodes);
    const first = edges();
    expect(repairBaseReactFlowFinalSafetyClosure(first, baselineNodes, { evaluation })).toBe(first);

    const equivalent = edges();
    let hitCount = 0;
    expect(repairBaseReactFlowFinalSafetyClosure(equivalent, baselineNodes, {
      evaluation,
      onNoopCacheHit: () => {
        hitCount += 1;
      },
    })).toBe(equivalent);
    expect(hitCount).toBe(1);

    const separateEvaluation = createBaseReactFlowFinalEndpointEvaluation(baselineNodes);
    repairBaseReactFlowFinalSafetyClosure(edges(), baselineNodes, {
      evaluation: separateEvaluation,
      onNoopCacheHit: () => {
        hitCount += 1;
      },
    });
    expect(hitCount).toBe(1);
  });

  it('reports bounded repair stages under the invoking safety transaction', () => {
    const baselineNodes = nodes();
    const traces: DisplayRoutingPhaseTrace[] = [];
    repairBaseReactFlowFinalSafetyClosure(edges(), baselineNodes, {
      evaluation: createBaseReactFlowFinalEndpointEvaluation(baselineNodes),
      onPhaseTrace: trace => traces.push(trace),
      traceParentPhase: 'final-commercial-safety-closure',
    });

    expect(traces).toEqual([expect.objectContaining({
      phase: 'final-safety-repair-baseline',
      parentPhase: 'final-commercial-safety-closure',
      candidateCount: 1,
      changedEdgeCount: 0,
      resolution: 'skip',
    })]);
  });

  it('reports only the aggregate count of render-unsafe endpoint stubs', () => {
    const baselineNodes = nodes();
    const unsafeEdges = edges();
    unsafeEdges[0] = {
      ...unsafeEdges[0],
      data: {
        computedPath: [
          { x: 100, y: 40 },
          { x: 140, y: 40 },
          { x: 260, y: 40 },
          { x: 300, y: 40 },
        ],
      },
    };
    const traces: DisplayRoutingPhaseTrace[] = [];

    expect(auditBaseReactFlowFinalSafetyClosure(
      unsafeEdges,
      baselineNodes,
      createBaseReactFlowFinalEndpointEvaluation(baselineNodes),
      trace => traces.push(trace),
    )).toEqual({ canSkip: false, endpointDefectOnly: false });
    expect(traces.find(trace => trace.phase === 'final-safety-stubs')).toMatchObject({
      candidateCount: 1,
      resolution: 'rejected',
      workItemCount: 2,
    });
  });
});
