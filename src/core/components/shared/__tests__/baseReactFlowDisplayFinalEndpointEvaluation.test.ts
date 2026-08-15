import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { commercialEdgeDetoursDoNotRegress } from '../baseReactFlowDisplayCommercialDetourGuard';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
  { id: 'target-a', position: { x: 0, y: 220 }, width: 100, height: 60, data: {} },
  { id: 'target-b', position: { x: 180, y: 220 }, width: 100, height: 60, data: {} },
];

const edges: Edge[] = [
  {
    id: 'a',
    source: 'source',
    target: 'target-a',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: { computedPath: [{ x: 50, y: 60 }, { x: 50, y: 220 }] },
  },
  {
    id: 'b',
    source: 'source',
    target: 'target-b',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: {
      computedPath: [
        { x: 50, y: 60 },
        { x: 50, y: 120 },
        { x: 230, y: 120 },
        { x: 230, y: 220 },
      ],
    },
  },
];

describe('createBaseReactFlowFinalEndpointEvaluation', () => {
  it('reuses exact request-local evidence for the same immutable route array', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);

    expect(evaluation.endpointOrder(edges)).toBe(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(edges)).toBe(evaluation.passageOrder(edges));
    expect(evaluation.hardReport(edges)).toBe(evaluation.hardReport(edges));
    expect(evaluation.unsafeEndpointStubs(edges)).toBe(evaluation.unsafeEndpointStubs(edges));
  });

  it('does not reuse identity-bound order evidence for a distinct candidate array', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const candidate = edges.map(edge => ({ ...edge }));

    expect(evaluation.endpointOrder(candidate)).not.toBe(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(candidate)).not.toBe(evaluation.passageOrder(edges));
    expect(evaluation.endpointOrder(candidate)).toEqual(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(candidate)).toEqual(evaluation.passageOrder(edges));
  });
});

describe('commercialEdgeDetoursDoNotRegress', () => {
  it('rejects a local endpoint-order candidate that sends a clean edge around the canvas', () => {
    const baseline: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target-a',
      data: { computedPath: [{ x: 50, y: 60 }, { x: 50, y: 220 }] },
    }];
    const canvasLoop: Edge[] = [{
      ...baseline[0],
      data: {
        computedPath: [
          { x: 50, y: 60 },
          { x: 50, y: 600 },
          { x: -320, y: 600 },
          { x: -320, y: 220 },
          { x: 50, y: 220 },
        ],
      },
    }];

    expect(commercialEdgeDetoursDoNotRegress(
      baseline,
      canvasLoop,
      [0],
    )).toBe(false);
  });

  it('allows a bounded obstacle skirt and does not tighten an inherited detour', () => {
    const baseline: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target-a',
      data: {
        computedPath: [
          { x: 50, y: 60 }, { x: 50, y: 120 },
          { x: 90, y: 120 }, { x: 90, y: 220 },
        ],
      },
    }];
    const boundedSkirt: Edge[] = [{
      ...baseline[0],
      data: {
        computedPath: [
          { x: 50, y: 60 }, { x: 50, y: 120 },
          { x: 110, y: 120 }, { x: 110, y: 220 },
        ],
      },
    }];

    expect(commercialEdgeDetoursDoNotRegress(
      baseline,
      boundedSkirt,
      [0],
    )).toBe(true);
  });
});
