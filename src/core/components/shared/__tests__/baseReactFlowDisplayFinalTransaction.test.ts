import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { finalizeFailClosedDisplayTransaction } from '../baseReactFlowDisplayFinalTransaction';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';

const nodes: Array<Node & { positionAbsolute: { x: number; y: number } }> = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    positionAbsolute: { x: 0, y: 0 },
    width: 100,
    height: 100,
    measured: { width: 100, height: 100 },
    data: {},
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    positionAbsolute: { x: 300, y: 0 },
    width: 100,
    height: 100,
    measured: { width: 100, height: 100 },
    data: {},
  },
];

const edgeWithPath = (computedPath: Array<{ x: number; y: number }>): Edge[] => [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: { computedPath },
}];

describe('finalizeFailClosedDisplayTransaction', () => {
  it('marks a fully clean terminal transaction as finalized', () => {
    const traces: DisplayRoutingPhaseTrace[] = [];
    const result = finalizeFailClosedDisplayTransaction(
      edgeWithPath([{ x: 100, y: 50 }, { x: 300, y: 50 }]),
      nodes,
      'clean-signature',
      { onPhaseTrace: trace => traces.push(trace) },
    );

    expect(result[0].data?.__baseDisplayFinalizedSignature).toBe('clean-signature');
    expect(result[0].type).toBe('stablePath');
    expect(result[0].data?.layoutPathLocked).toBe(true);
    expect(result[0].data?._layoutPathLocked).toBe(true);
    expect(traces.find(trace => trace.phase === 'terminal-fail-closed-strict')).toMatchObject({
      evaluationCount: 0,
      scannedNodeCount: 0,
      resolution: 'skip',
    });
  });

  it('does not finalize a transaction with detached terminals', () => {
    const result = finalizeFailClosedDisplayTransaction(
      edgeWithPath([{ x: 150, y: 50 }, { x: 250, y: 50 }]),
      nodes,
      'unsafe-signature',
    );

    expect(result[0].data?.__baseDisplayFinalizedSignature).toBeUndefined();
  });

  it('removes redundant collinear waypoints before the final commit', () => {
    const result = finalizeFailClosedDisplayTransaction(
      edgeWithPath([
        { x: 100, y: 50 }, { x: 180, y: 50 },
        { x: 200, y: 50 }, { x: 300, y: 50 },
      ]),
      nodes,
      'compact-signature',
    );

    expect(result[0].data?.computedPath).toEqual([
      { x: 100, y: 50 }, { x: 300, y: 50 },
    ]);
    expect(result[0].data?.__baseDisplayFinalizedSignature).toBe('compact-signature');
  });

  it('closes a newly safe interior micro dogleg before the final hard gate', () => {
    const microNodes = nodes.map(node => node.id === 'target'
      ? {
        ...node,
        position: { x: 300, y: 200 },
        positionAbsolute: { x: 300, y: 200 },
      }
      : node);
    const baseline = edgeWithPath([
      { x: 100, y: 50 },
      { x: 148, y: 50 },
      { x: 148, y: 110 },
      { x: 210, y: 110 },
      { x: 210, y: 122 },
      { x: 252, y: 122 },
      { x: 252, y: 250 },
      { x: 300, y: 250 },
    ]);

    const result = finalizeFailClosedDisplayTransaction(
      baseline,
      microNodes,
      'micro-closure-signature',
    );
    const deferredCompoundResult = finalizeFailClosedDisplayTransaction(
      baseline,
      microNodes,
      'micro-closure-signature',
      { deferCompoundRepair: true },
    );

    expect(calculateEdgePathQualityScore(baseline).tinyInteriorDoglegs).toBe(1);
    expect(calculateEdgePathQualityScore(result).tinyInteriorDoglegs).toBe(0);
    expect(getDisplayComputedPath(result[0])).toEqual([
      { x: 100, y: 50 },
      { x: 148, y: 50 },
      { x: 148, y: 122 },
      { x: 252, y: 122 },
      { x: 252, y: 250 },
      { x: 300, y: 250 },
    ]);
    expect(result[0].data?.__baseDisplayFinalizedSignature).toBe('micro-closure-signature');
    expect(getDisplayComputedPath(deferredCompoundResult[0]))
      .toEqual(getDisplayComputedPath(result[0]));
    expect(deferredCompoundResult[0].data?.__baseDisplayFinalizedSignature)
      .toBe('micro-closure-signature');
  });
});
