import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { createBaseDisplayHardGateMemo } from '../baseReactFlowDisplayHardGateMemo';
import {
  collectBoundedDisplayRoutingPairDiagnostics,
  isBaseReactFlowDisplayDiagnosticsEnabled,
} from '../baseReactFlowDisplayDiagnostics';
import type { BaseDisplayBoundedCandidateReport } from '../baseReactFlowDisplayEvaluation';
import type { DisplayTerminalValidationSnapshot } from '../baseReactFlowTerminalAxisRepair';
import { createDisplayTerminalValidationSnapshot } from '../baseReactFlowTerminalValidation';

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
    expect(memo.readMetrics()).toEqual({
      evaluationCount: 1,
      cacheHitCount: 1,
      scannedNodeCount: 0,
      scannedEdgePairCount: 0,
    });
    expect(terminalLane.candidate).toBe('terminal-lane');
    expect(polished).toEqual({ ...terminalLane, candidate: 'polished' });
  });

  it('invalidates the cached report when route geometry changes', () => {
    const evaluate = createEvaluator();
    const memo = createBaseDisplayHardGateMemo(nodes, terminalSnapshot, evaluate);

    memo.getReport([routedEdge(100)], nodes, 'polished');
    memo.getReport([routedEdge(120)], nodes, 'polished');

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(memo.readMetrics()).toEqual({
      evaluationCount: 2,
      cacheHitCount: 0,
      scannedNodeCount: 0,
      scannedEdgePairCount: 0,
    });
  });

  it('does not cache unsupported empty routes', () => {
    const evaluate = createEvaluator();
    const memo = createBaseDisplayHardGateMemo(nodes, terminalSnapshot, evaluate);

    memo.getReport([], nodes, 'polished');
    memo.getReport([], nodes, 'polished');

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(memo.readMetrics()).toEqual({
      evaluationCount: 2,
      cacheHitCount: 0,
      scannedNodeCount: 0,
      scannedEdgePairCount: 0,
    });
  });

  it('accepts Worker-private signed evidence without repeating its evaluation', () => {
    const evaluate = createEvaluator();
    const memo = createBaseDisplayHardGateMemo(nodes, terminalSnapshot, evaluate);
    const route = [routedEdge()];
    const report: BaseDisplayBoundedCandidateReport = {
      candidate: 'polished',
      hardClean: true,
      obstacleHits: 0,
      terminalsAttached: true,
      terminalsAnchored: true,
      quality,
    };

    expect(memo.rememberReport(route, report)).toBe(true);
    expect(memo.getReport([routedEdge()], nodes, 'polished')).toBe(report);
    expect(evaluate).not.toHaveBeenCalled();
    expect(memo.readMetrics()).toEqual({
      evaluationCount: 0,
      cacheHitCount: 1,
      scannedNodeCount: 0,
      scannedEdgePairCount: 0,
    });

    memo.getReport([routedEdge(120)], nodes, 'polished');
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(memo.rememberReport([], report)).toBe(false);
  });

  it('reports actual scans while a route cache hit adds no scan work', () => {
    const routingNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, width: 40, height: 40, data: {} },
      { id: 'target-a', position: { x: 240, y: 0 }, width: 40, height: 40, data: {} },
      { id: 'target-b', position: { x: 240, y: 200 }, width: 40, height: 40, data: {} },
      { id: 'blocker', position: { x: 100, y: 100 }, width: 40, height: 40, data: {} },
    ];
    const routedEdges: Edge[] = [{
      id: 'scan-a', source: 'source', target: 'target-a',
      data: { computedPath: [{ x: 40, y: 20 }, { x: 240, y: 20 }] },
    }, {
      id: 'scan-b', source: 'source', target: 'target-b',
      data: { computedPath: [{ x: 20, y: 40 }, { x: 20, y: 220 }, { x: 240, y: 220 }] },
    }];
    const memo = createBaseDisplayHardGateMemo(
      routingNodes,
      createDisplayTerminalValidationSnapshot(routingNodes),
    );
    memo.getReport(routedEdges, routingNodes, 'polished');
    const evaluated = memo.readMetrics();
    expect(evaluated).toMatchObject({
      evaluationCount: 1,
      cacheHitCount: 0,
      scannedEdgePairCount: 1,
    });
    expect(evaluated.scannedNodeCount).toBeGreaterThan(0);

    memo.getReport(routedEdges.map(edge => ({ ...edge })), routingNodes, 'polished');
    expect(memo.readMetrics()).toEqual({ ...evaluated, cacheHitCount: 1 });
  });
});

const createDiagnosticEdge = (index: number): Edge => ({
  id: `edge-${index}`,
  source: `source-${index}`,
  target: `target-${index}`,
  data: {
    computedPath: [
      { x: 0, y: index * 100 },
      { x: 100, y: index * 100 },
    ],
  },
});

describe('baseReactFlowDisplayDiagnostics', () => {
  it('requires an explicit boolean flag in every host environment', () => {
    expect(isBaseReactFlowDisplayDiagnosticsEnabled(undefined)).toBe(false);
    expect(isBaseReactFlowDisplayDiagnosticsEnabled({})).toBe(false);
    expect(isBaseReactFlowDisplayDiagnosticsEnabled({
      __vizlyDisplayRoutingDiagnosticsEnabled: 'true',
    })).toBe(false);
    expect(isBaseReactFlowDisplayDiagnosticsEnabled({
      __vizlyDisplayRoutingDiagnosticsEnabled: true,
    })).toBe(true);
  });

  it('caps pair and edge work before a dense graph reaches quadratic evaluation', () => {
    const edges = [0, 1, 2, 3].map(createDiagnosticEdge);
    const pairLimited = collectBoundedDisplayRoutingPairDiagnostics({
      edges,
      maxPairEvaluations: 2,
      maxDurationMs: 100,
      maxReportedPairs: 20,
      now: () => 0,
    });
    const edgeLimited = collectBoundedDisplayRoutingPairDiagnostics({
      edges,
      maxEdgeCount: 3,
      maxPairEvaluations: 512,
      maxDurationMs: 100,
      maxReportedPairs: 20,
      now: () => 0,
    });

    expect(pairLimited).toEqual(expect.objectContaining({
      evaluatedPairCount: 2,
      truncated: true,
    }));
    expect(edgeLimited).toEqual(expect.objectContaining({
      evaluatedPairCount: 3,
      truncated: true,
    }));
  });

  it('honors the time budget and handles empty or in-budget input', () => {
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(9);
    expect(collectBoundedDisplayRoutingPairDiagnostics({
      edges: [createDiagnosticEdge(0), createDiagnosticEdge(1)],
      maxDurationMs: 8,
      now,
    })).toEqual(expect.objectContaining({
      evaluatedPairCount: 0,
      truncated: true,
    }));
    expect(collectBoundedDisplayRoutingPairDiagnostics({
      edges: [],
      now: () => 0,
    })).toEqual({
      pairs: [],
      evaluatedPairCount: 0,
      truncated: false,
    });
    expect(collectBoundedDisplayRoutingPairDiagnostics({
      edges: [createDiagnosticEdge(0), createDiagnosticEdge(1)],
      now: () => 0,
    })).toEqual(expect.objectContaining({
      evaluatedPairCount: 1,
      truncated: false,
    }));
  });
});
