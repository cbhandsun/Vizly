import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { withDisplayAbsolutePositions } from '../baseReactFlowDisplayEdgeCore';
import {
  repairBaseReactFlowMeasuredDisplayEdges,
  repairBaseReactFlowMeasuredDisplayEdgesWithReport,
} from '../baseReactFlowDisplayMeasuredRepair';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    data: {},
    width: 100,
    height: 100,
    measured: { width: 100, height: 100 },
  },
  {
    id: 'target',
    position: { x: 220, y: 0 },
    data: {},
    width: 100,
    height: 100,
    measured: { width: 100, height: 100 },
  },
];

const edges: Edge[] = [{
  id: 'source-target',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {
    computedPath: [
      { x: 100, y: 50 },
      { x: 220, y: 50 },
    ],
  },
}];

const repairNodes = withDisplayAbsolutePositions(
  nodes,
  new Map(nodes.map(node => [node.id, node] as const)),
);

describe('measured display repair outcome', () => {
  it('returns the exact trusted report with the repaired edges and preserves the legacy wrapper', () => {
    const initialReport = getDisplayHardQualityGateReport(edges, repairNodes, 'polished');
    expect(initialReport.hardClean).toBe(true);

    const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(edges, nodes, {
      edges,
      inputNodes: nodes,
      repairNodes,
      report: initialReport,
    });
    const independentReport = getDisplayHardQualityGateReport(
      outcome.edges,
      repairNodes,
      'polished',
    );

    expect(outcome.report).toBe(initialReport);
    expect(outcome.report).toEqual(independentReport);
    expect(repairBaseReactFlowMeasuredDisplayEdges(edges, nodes, {
      edges,
      inputNodes: nodes,
      repairNodes,
      report: initialReport,
    })).toEqual(outcome.edges);
  });

  it('rejects an initial report whose edge array identity does not match', () => {
    const initialReport = getDisplayHardQualityGateReport(edges, repairNodes, 'polished');

    const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(edges, nodes, {
      edges: [...edges],
      inputNodes: nodes,
      repairNodes,
      report: initialReport,
    });

    expect(outcome.report).not.toBe(initialReport);
    expect(outcome.report).toEqual(getDisplayHardQualityGateReport(
      outcome.edges,
      repairNodes,
      'polished',
    ));
  });

  it('rejects an initial report whose input-node array identity does not match', () => {
    const initialReport = getDisplayHardQualityGateReport(edges, repairNodes, 'polished');

    const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(edges, nodes, {
      edges,
      inputNodes: [...nodes],
      repairNodes,
      report: initialReport,
    });

    expect(outcome.report).not.toBe(initialReport);
    expect(outcome.report).toEqual(getDisplayHardQualityGateReport(
      outcome.edges,
      repairNodes,
      'polished',
    ));
  });

  it('preserves the legacy empty-input identity while returning an exact report', () => {
    const emptyEdges: Edge[] = [];
    const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(emptyEdges, []);

    expect(outcome.edges).toBe(emptyEdges);
    expect(outcome.report).toEqual(getDisplayHardQualityGateReport(
      emptyEdges,
      [],
      'polished',
    ));
    expect(repairBaseReactFlowMeasuredDisplayEdges(emptyEdges, [])).toBe(emptyEdges);
  });
});
