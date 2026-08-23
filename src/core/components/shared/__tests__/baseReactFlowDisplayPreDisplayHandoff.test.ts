import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createBaseReactFlowFullRouteEdges = vi.hoisted(() => vi.fn(
  (args: { edges: Edge[] }) => args.edges,
));

vi.mock('../baseReactFlowDisplayFullRoutePipeline', () => ({
  createBaseReactFlowFullRouteEdges,
}));

import { createBaseReactFlowPreDisplayFinalEdges } from '../baseReactFlowDisplayPreDisplayPipeline';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  type BaseReactFlowFinalEndpointEvaluation,
} from '../baseReactFlowDisplayFinalEndpointEvaluation';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    width: 100,
    height: 60,
    data: {},
  },
  {
    id: 'target',
    position: { x: 0, y: 200 },
    width: 100,
    height: 60,
    data: {},
  },
];

const edges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'bottom',
  targetHandle: 'top',
  data: {
    computedPath: [{ x: 50, y: 60 }, { x: 50, y: 200 }],
    layoutPathLocked: true,
    layoutDirection: 'TB',
  },
}];

const route = (skipFullRouteFallback = false): Edge[] => {
  const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
  const hardReport: BaseReactFlowFinalEndpointEvaluation['hardReport'] = () => ({
    candidate: 'polished',
    hardClean: false,
    obstacleHits: 0,
    terminalsAttached: false,
    terminalsAnchored: false,
    quality: {
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      relatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
      backtrackPenalty: 0,
      detourPenalty: 0,
      bends: 0,
      totalLength: 140,
    },
  });
  return createBaseReactFlowPreDisplayFinalEdges({
    edges,
    nodes,
    enableSmartEdges: true,
    smartEdgePadding: 20,
    isLargeGraph: false,
    displayEdgeEpoch: 1,
    skipFullRouteFallback,
    evaluationSession: {
      ...evaluation,
      hardReport,
    },
  });
};

describe('pre-display full-route handoff', () => {
  beforeEach(() => {
    createBaseReactFlowFullRouteEdges.mockClear();
  });

  it('invokes the full-route pipeline at most once on the normal fallback path', () => {
    route();

    expect(createBaseReactFlowFullRouteEdges).toHaveBeenCalledTimes(1);
    expect(createBaseReactFlowFullRouteEdges).toHaveBeenCalledWith(expect.objectContaining({
      reusePreparedGlobalRouting: true,
      skipBoundedAttempt: true,
    }));
    const fallbackEdges = createBaseReactFlowFullRouteEdges.mock.calls[0][0].edges;
    expect(fallbackEdges).not.toBe(edges);
    expect((fallbackEdges[0].data as any).computedPath).toEqual((edges[0].data as any).computedPath);
  });

  it('does not invoke the full-route pipeline when fallback is disabled', () => {
    route(true);

    expect(createBaseReactFlowFullRouteEdges).not.toHaveBeenCalled();
  });
});
