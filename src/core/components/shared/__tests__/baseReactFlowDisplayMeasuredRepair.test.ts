import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { withDisplayAbsolutePositions } from '../baseReactFlowDisplayEdgeCore';
import {
  repairBaseReactFlowMeasuredDisplayEdges,
  repairBaseReactFlowMeasuredDisplayEdgesWithReport,
} from '../baseReactFlowDisplayMeasuredRepair';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';

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

  it('repairs attached terminal-axis mismatches even without crossings or overlaps', () => {
    const axisMismatchEdges: Edge[] = [{
      ...edges[0],
      data: {
        computedPath: [
          { x: 100, y: 50 },
          { x: 100, y: 150 },
          { x: 220, y: 150 },
          { x: 220, y: 50 },
        ],
      },
    }];
    const initialReport = getDisplayHardQualityGateReport(
      axisMismatchEdges,
      repairNodes,
      'polished',
    );
    expect(initialReport.terminalsAttached).toBe(true);
    expect(initialReport.terminalsAnchored).toBe(false);
    expect(initialReport.quality.strictCrossings).toBe(0);

    const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      axisMismatchEdges,
      nodes,
    );

    expect(outcome.report.hardClean).toBe(true);
    expect(outcome.report.terminalsAnchored).toBe(true);
  });

  it('shares exact hard-report evidence with the request-local evaluation session', () => {
    const axisMismatchEdges: Edge[] = [{
      ...edges[0],
      data: {
        computedPath: [
          { x: 100, y: 50 },
          { x: 100, y: 150 },
          { x: 220, y: 150 },
          { x: 220, y: 50 },
        ],
      },
    }];
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(repairNodes);
    const initialReport = evaluation.hardReport(axisMismatchEdges);
    const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      axisMismatchEdges,
      nodes,
      {
        edges: axisMismatchEdges,
        inputNodes: nodes,
        repairNodes,
        report: initialReport,
        evaluation,
      },
    );
    const beforeReuse = evaluation.readMetrics();

    expect(outcome.report.hardClean).toBe(true);
    expect(evaluation.hardReport(outcome.edges)).toEqual(outcome.report);
    expect(evaluation.readMetrics().cacheHitCount).toBe(beforeReuse.cacheHitCount + 1);
  });

  it('closes terminal repair regressions from the measured WMS browser geometry', () => {
    const browserNodes: Node[] = [
      { id: 'allocation', position: { x: 1080, y: 1450 }, width: 206, height: 96, data: {} },
      { id: 'batch-lot', position: { x: 1612, y: 1662 }, width: 194, height: 73, data: {} },
      { id: 'wave-planning', position: { x: 1606, y: 1895 }, width: 206, height: 73, data: {} },
      {
        id: 'labor-schedule-feedback',
        position: { x: 6145, y: 1552 },
        width: 202,
        height: 60,
        data: {},
      },
    ];
    const browserEdges: Edge[] = [
      {
        id: 'e-batch', source: 'allocation', target: 'batch-lot',
        sourceHandle: 'right', targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1286, y: 1466 }, { x: 1565, y: 1466 }, { x: 1565, y: 1790 },
          { x: 1709, y: 1790 }, { x: 1709, y: 1735 },
        ] },
      },
      {
        id: 'e-wave-plan', source: 'allocation', target: 'wave-planning',
        sourceHandle: 'bottom', targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1286, y: 1514 }, { x: 1286, y: 1587 }, { x: 1398, y: 1587 },
          { x: 1398, y: 1683 }, { x: 1566, y: 1683 }, { x: 1566, y: 2023 },
          { x: 1709, y: 2023 }, { x: 1709, y: 1968 },
        ] },
      },
      {
        id: 'e-labor-alloc-fb', source: 'labor-schedule-feedback', target: 'allocation',
        sourceHandle: 'bottom', targetHandle: 'right',
        data: { computedPath: [
          { x: 6246, y: 1612 }, { x: 6246, y: 1708 }, { x: 6294, y: 1708 },
          { x: 6294, y: 2213 }, { x: 1346, y: 2213 }, { x: 1346, y: 1586 },
          { x: 1382, y: 1586 }, { x: 1382, y: 1498 }, { x: 1286, y: 1498 },
        ] },
      },
    ];
    const initial = getDisplayHardQualityGateReport(browserEdges, browserNodes, 'polished');
    expect(initial.quality.hairpins).toBe(1);
    expect(initial.quality.unexplainedRelatedOverlap).toBe(143);

    const phaseTrace: DisplayRoutingPhaseTrace[] = [];
    const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      browserEdges,
      browserNodes,
      undefined,
      false,
      trace => phaseTrace.push(trace),
    );

    expect(outcome.report, JSON.stringify(outcome.report)).toMatchObject({
      hardClean: true,
      terminalsAttached: true,
      terminalsAnchored: true,
    });
    expect(phaseTrace).toContainEqual(expect.objectContaining({
      phase: 'measured-repair-normalize',
      parentPhase: 'measured-repair',
    }));
    expect(phaseTrace.filter(trace => trace.phase.startsWith('measured-repair-')).every(
      trace => trace.parentPhase === 'measured-repair',
    )).toBe(true);
  });

  it('closes the anchored WMS allocation residual transaction', () => {
    const browserNodes: Node[] = [
      { id: 'allocation', position: { x: 1080, y: 1417.5 }, width: 206, height: 96, data: {} },
      { id: 'batch-lot', position: { x: 1612, y: 1662 }, width: 194, height: 73, data: {} },
      { id: 'wave-planning', position: { x: 1606, y: 1895 }, width: 206, height: 73, data: {} },
      { id: 'allocation-rollback', position: { x: 1624, y: 2128.5 }, width: 170, height: 73, data: {} },
    ];
    const browserEdges: Edge[] = [
      {
        id: 'e-batch', source: 'allocation', target: 'batch-lot',
        sourceHandle: 'right', targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1286, y: 1466 }, { x: 1577, y: 1466 }, { x: 1577, y: 1790 },
          { x: 1709, y: 1790 }, { x: 1709, y: 1735 },
        ] },
      },
      {
        id: 'e-alloc-rollback', source: 'allocation', target: 'allocation-rollback',
        sourceHandle: 'right', targetHandle: 'left',
        data: { computedPath: [
          { x: 1286, y: 1514 }, { x: 1342, y: 1514 }, { x: 1342, y: 1586 },
          { x: 1374, y: 1586 }, { x: 1374, y: 2165 }, { x: 1624, y: 2165 },
        ] },
      },
      {
        id: 'e-wave-plan', source: 'allocation', target: 'wave-planning',
        sourceHandle: 'bottom', targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1285.8, y: 1513.5 }, { x: 1286, y: 1586 }, { x: 1566, y: 1586 },
          { x: 1566, y: 2023 }, { x: 1709, y: 2023 }, { x: 1709, y: 1968 },
        ] },
      },
    ];
    const initial = getDisplayHardQualityGateReport(browserEdges, browserNodes, 'polished');
    expect(initial).toMatchObject({ terminalsAnchored: true });
    expect(initial.quality).toMatchObject({ hairpins: 1, unexplainedRelatedOverlap: 0 });

    const outcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(browserEdges, browserNodes);

    expect(outcome.report, JSON.stringify(outcome.report)).toMatchObject({
      hardClean: true,
      terminalsAttached: true,
      terminalsAnchored: true,
    });
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
