import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markBaseDisplayFinalized } from '../baseReactFlowDisplayEdgeCore';
import { closeBaseReactFlowFinalDisplayRoute } from '../baseReactFlowDisplayFinalRouteClosure';
import * as finalizer from '../baseReactFlowDisplayFinalizer';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const nodes: Node[] = [
  { id: 'source', position: { x: -100, y: -40 }, width: 100, height: 80, data: {} },
  { id: 'target', position: { x: 400, y: -40 }, width: 100, height: 80, data: {} },
];

afterEach(() => vi.restoreAllMocks());

describe('final route closure reuse', () => {
  it.each(['current', 'older'])('repairs invalid geometry despite a %s finalized marker', (marker) => {
    const edges = markBaseDisplayFinalized<Edge[]>([{
      id: 'transfer', source: 'source', target: 'target', sourceHandle: 'right', targetHandle: 'left',
      data: { computedPath: [
        { x: 0, y: 0 }, { x: 0, y: -120 }, { x: 400, y: -120 }, { x: 400, y: 0 },
      ] },
    }], marker);
    expect(getDisplayHardQualityGateReport(edges, nodes, 'polished').terminalsAnchored).toBe(false);
    const repairFailure = new Error('finalizer failure must propagate');
    const repair = vi.spyOn(finalizer, 'finalizeBaseReactFlowDisplayEdges').mockImplementation(() => {
      throw repairFailure;
    });
    expect(() => closeBaseReactFlowFinalDisplayRoute({
      args: { edges, nodes, enableSmartEdges: true, smartEdgePadding: 20, isLargeGraph: false, displayEdgeEpoch: 1 },
      routedEdges: edges, repairNodes: nodes, inputSignature: 'current',
    })).toThrow(repairFailure);
    expect(repair).toHaveBeenCalledOnce();
  });

  it('does not repeat finalization for an exactly clean empty route', () => {
    const repair = vi.spyOn(finalizer, 'finalizeBaseReactFlowDisplayEdges');
    const edges: Edge[] = [];
    expect(closeBaseReactFlowFinalDisplayRoute({
      args: { edges, nodes: [], enableSmartEdges: true, smartEdgePadding: 20, isLargeGraph: false, displayEdgeEpoch: 0 },
      routedEdges: edges, repairNodes: [], inputSignature: 'empty',
    })).toEqual([]);
    expect(repair).not.toHaveBeenCalled();
  });

  it('reuses a currently clean route without requiring a finalized marker', () => {
    const edges: Edge[] = [{
      id: 'transfer', source: 'source', target: 'target', sourceHandle: 'right', targetHandle: 'left',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 400, y: 0 }] },
    }];
    expect(getDisplayHardQualityGateReport(edges, nodes, 'polished').hardClean).toBe(true);
    const repair = vi.spyOn(finalizer, 'finalizeBaseReactFlowDisplayEdges');
    const result = closeBaseReactFlowFinalDisplayRoute({
      args: { edges, nodes, enableSmartEdges: true, smartEdgePadding: 20, isLargeGraph: false, displayEdgeEpoch: 1 },
      routedEdges: edges, repairNodes: nodes, inputSignature: 'current',
    });
    expect(result).toHaveLength(1);
    expect(getDisplayHardQualityGateReport(result, nodes, 'polished').hardClean).toBe(true);
    expect(repair).not.toHaveBeenCalled();
  });
});
