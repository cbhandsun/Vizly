import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createBaseReactFlowChangedHardReportEvaluation } from '../baseReactFlowDisplayChangedHardReport';
import { createDisplayObstacleHitContext } from '../baseReactFlowDisplayObstacleHitCache';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const nodes: Node[] = Array.from({ length: 20 }, (_, index) => ({
  id: index < 10 ? `source-${index}` : `target-${index - 10}`,
  position: { x: index < 10 ? 0 : 300, y: (index % 10) * 120 },
  width: 100,
  height: 60,
  data: {},
}));

const edges: Edge[] = Array.from({ length: 10 }, (_, index) => ({
  id: `edge-${index}`,
  source: `source-${index}`,
  target: `target-${index}`,
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {
    computedPath: [
      { x: 100, y: index * 120 + 30 },
      { x: 300, y: index * 120 + 30 },
    ],
  },
}));

const changePath = (baseline: Edge[], indexes: readonly number[]): Edge[] => (
  baseline.map((edge, index) => indexes.includes(index) ? {
    ...edge,
    data: {
      ...edge.data,
      computedPath: [
        { x: 100, y: index * 120 + 30 },
        { x: 180, y: index * 120 + 30 },
        { x: 180, y: index * 120 + 70 },
        { x: 300, y: index * 120 + 70 },
      ],
    },
  } : edge)
);

describe('baseReactFlow changed hard report', () => {
  it('matches the complete hard report field-for-field for bounded immutable changes', () => {
    const candidate = changePath(edges, [0, 3]);
    const evaluation = createBaseReactFlowChangedHardReportEvaluation(edges, nodes);

    expect(evaluation.evaluate(candidate, [0, 3], 'polished'))
      .toEqual(getDisplayHardQualityGateReport(candidate, nodes, 'polished'));
  });

  it('fails closed for empty, duplicate, invalid, undeclared, and over-budget change sets', () => {
    const candidate = changePath(edges, [0]);
    const evaluation = createBaseReactFlowChangedHardReportEvaluation(edges, nodes);

    expect(evaluation.evaluate(candidate, [], 'polished')).toBeNull();
    expect(evaluation.evaluate(candidate, [0, 0], 'polished')).toBeNull();
    expect(evaluation.evaluate(candidate, [-1], 'polished')).toBeNull();
    expect(evaluation.evaluate([...candidate], [1], 'polished')).toBeNull();
    expect(evaluation.evaluate(changePath(edges, [0, 1, 2, 3, 4, 5, 6, 7, 8]),
      [0, 1, 2, 3, 4, 5, 6, 7, 8], 'polished')).toBeNull();
  });

  it('keeps malformed non-finite geometry in parity with the fail-closed full gate', () => {
    const candidate = changePath(edges, [0]);
    candidate[0] = {
      ...candidate[0],
      data: {
        ...candidate[0].data,
        computedPath: [{ x: Number.NaN, y: 30 }, { x: 300, y: 30 }],
      },
    };
    const evaluation = createBaseReactFlowChangedHardReportEvaluation(edges, nodes);

    expect(evaluation.evaluate(candidate, [0], 'polished'))
      .toEqual(getDisplayHardQualityGateReport(candidate, nodes, 'polished'));
  });

  it('does not attribute historic shared obstacle scans to a new evaluation phase', () => {
    const isolatedNodes = nodes.map(node => ({ ...node, position: { ...node.position } }));
    const hitContext = createDisplayObstacleHitContext(isolatedNodes);
    for (let index = 0; index < 100; index += 1) {
      hitContext.countUnrelated([
        { x: 100, y: 30 + index },
        { x: 300, y: 30 + index },
      ], edges[0]);
    }
    const historicScans = hitContext.readMetrics().scannedNodeCount;
    expect(historicScans).toBeGreaterThan(1_000);

    const evaluation = createBaseReactFlowChangedHardReportEvaluation(edges, isolatedNodes);

    expect(evaluation.readMetrics().scannedNodeCount).toBeLessThan(historicScans);
  });
});
