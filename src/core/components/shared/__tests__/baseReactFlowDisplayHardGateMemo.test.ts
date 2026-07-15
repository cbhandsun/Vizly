import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { createBaseDisplayHardGateMemo } from '../baseReactFlowDisplayHardGateMemo';
import type { BaseDisplayBoundedCandidateReport } from '../baseReactFlowDisplayEvaluation';
import type { DisplayTerminalValidationSnapshot } from '../baseReactFlowTerminalAxisRepair';

const quality = {
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
  bends: 1,
  totalLength: 100,
};

const routedEdge = (middleX = 100): Edge => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {
    computedPath: [
      { x: 0, y: 0 },
      { x: middleX, y: 0 },
      { x: middleX, y: 100 },
    ],
  },
});

describe('baseReactFlowDisplayHardGateMemo', () => {
  const nodes: Node[] = [];
  const terminalSnapshot = {} as DisplayTerminalValidationSnapshot;

  const createEvaluator = () => vi.fn((
    _edges: Edge[],
    _nodes: Node[],
    candidate: BaseDisplayBoundedCandidateReport['candidate'],
  ): BaseDisplayBoundedCandidateReport => ({
    candidate,
    hardClean: true,
    obstacleHits: 0,
    terminalsAttached: true,
    terminalsAnchored: true,
    quality,
  }));

  it('reuses one exact route report across pipeline candidate labels', () => {
    const evaluate = createEvaluator();
    const memo = createBaseDisplayHardGateMemo(nodes, terminalSnapshot, evaluate);
    const firstEdges = [routedEdge()];
    const equivalentEdges = [routedEdge()];

    const terminalLane = memo.getReport(firstEdges, nodes, 'terminal-lane');
    const polished = memo.getReport(equivalentEdges, nodes, 'polished');

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(terminalLane.candidate).toBe('terminal-lane');
    expect(polished).toEqual({ ...terminalLane, candidate: 'polished' });
  });

  it('invalidates the cached report when route geometry changes', () => {
    const evaluate = createEvaluator();
    const memo = createBaseDisplayHardGateMemo(nodes, terminalSnapshot, evaluate);

    memo.getReport([routedEdge(100)], nodes, 'polished');
    memo.getReport([routedEdge(120)], nodes, 'polished');

    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('does not cache unsupported empty routes', () => {
    const evaluate = createEvaluator();
    const memo = createBaseDisplayHardGateMemo(nodes, terminalSnapshot, evaluate);

    memo.getReport([], nodes, 'polished');
    memo.getReport([], nodes, 'polished');

    expect(evaluate).toHaveBeenCalledTimes(2);
  });
});
