import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { auditFinalSameSideEndpointOrder } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { buildSiblingTerminalObstacleSkirtCandidates } from '../baseReactFlowDisplaySiblingTerminalObstacleRepair';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

const edge = (
  id: string,
  source: string,
  target: string,
  path: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source,
  target,
  sourceHandle: 'bottom',
  targetHandle: 'bottom',
  data: { computedPath: path },
});

describe('sibling terminal obstacle skirts', () => {
  it('keeps dual terminal trunks while an O2M branch clears its sibling target', () => {
    const nodes = [
      node('source', 940, 812, 250, 118),
      node('sibling-target', 1213, 1090, 250, 118),
      node('target', 1870, 100, 200, 80),
      node('target-peer-source', 1500, 1540, 100, 100),
    ];
    const edges = [
      edge('main', 'source', 'target', [
        { x: 1065, y: 930 },
        { x: 1065, y: 1091 },
        { x: 1970, y: 1091 },
        { x: 1970, y: 180 },
      ]),
      edge('sibling', 'source', 'sibling-target', [
        { x: 1065, y: 930 },
        { x: 1065, y: 1022 },
        { x: 1338, y: 1022 },
        { x: 1338, y: 1090 },
      ]),
      edge('source-peer', 'source', 'target-peer-source', [
        { x: 1065, y: 930 },
        { x: 1065, y: 1248 },
        { x: 1550, y: 1248 },
        { x: 1550, y: 1540 },
      ]),
      edge('target-peer', 'target-peer-source', 'target', [
        { x: 1550, y: 1540 },
        { x: 1550, y: 1458 },
        { x: 1970, y: 1458 },
        { x: 1970, y: 180 },
      ]),
    ];
    const baselineTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;
    const candidates = buildSiblingTerminalObstacleSkirtCandidates(edges, nodes);
    const candidate = candidates.find(item => (
      countDisplayObstacleHits(item, nodes) === 0
      && getDisplayHardQualityGateReport(item, nodes, 'polished').quality.strictCrossings === 0
    ));

    expect(countDisplayObstacleHits(edges, nodes)).toBe(1);
    expect(candidate).toBeDefined();
    const candidateTrunks = auditFinalSameSideEndpointOrder(candidate ?? edges, nodes).legalSharedTrunks;
    expect(baselineTrunks.every(trunk => candidateTrunks.some(next => (
      next.nodeId === trunk.nodeId
      && next.role === trunk.role
      && trunk.edgeIds.every(edgeId => next.edgeIds.includes(edgeId))
      && next.commonStemLength >= trunk.commonStemLength
    )))).toBe(true);
    expect((candidate?.[0].data as { computedPath?: unknown })?.computedPath).toEqual([
      { x: 1065, y: 930 },
      { x: 1065, y: 1232 },
      { x: 1487, y: 1232 },
      { x: 1487, y: 1091 },
      { x: 1970, y: 1091 },
      { x: 1970, y: 180 },
    ]);
  });

  it('applies the symmetric skirt when an M2O branch crosses a sibling source', () => {
    const nodes = [
      node('target', 940, 812, 250, 118),
      node('sibling-source', 1213, 1090, 250, 118),
      node('source', 1870, 100, 200, 80),
    ];
    const edges = [
      edge('main', 'source', 'target', [
        { x: 1970, y: 180 },
        { x: 1970, y: 1091 },
        { x: 1065, y: 1091 },
        { x: 1065, y: 930 },
      ]),
      edge('sibling', 'sibling-source', 'target', [
        { x: 1338, y: 1090 },
        { x: 1338, y: 1022 },
        { x: 1065, y: 1022 },
        { x: 1065, y: 930 },
      ]),
    ];
    const candidate = buildSiblingTerminalObstacleSkirtCandidates(edges, nodes)
      .find(item => countDisplayObstacleHits(item, nodes) === 0);

    expect(countDisplayObstacleHits(edges, nodes)).toBe(1);
    expect(candidate).toBeDefined();
    expect((candidate?.[0].data as { computedPath?: unknown })?.computedPath).toEqual([
      { x: 1970, y: 180 },
      { x: 1970, y: 1232 },
      { x: 1189, y: 1232 },
      { x: 1189, y: 1091 },
      { x: 1065, y: 1091 },
      { x: 1065, y: 930 },
    ]);
  });
});
