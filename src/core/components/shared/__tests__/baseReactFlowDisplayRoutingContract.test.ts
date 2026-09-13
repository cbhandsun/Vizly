import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createDisplayRoutingContractReport } from '../baseReactFlowDisplayRoutingContract';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
  {
    id: 'obstacle',
    position: { x: 180, y: 160 },
    measured: { width: 80, height: 60 },
    data: {},
  },
];

const edgeWithPath = (
  id: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {
    computedPath,
  },
});

describe('display routing contract report', () => {
  it('accepts a final route that satisfies hard, commercial, endpoint and passage contracts', () => {
    const edges = [
      edgeWithPath('clean', [
        { x: 100, y: 30 },
        { x: 156, y: 30 },
        { x: 244, y: 30 },
        { x: 300, y: 30 },
      ]),
    ];

    const report = createDisplayRoutingContractReport(edges, nodes);

    expect(report.clean).toBe(true);
    expect(report.hardClean).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it('classifies hard geometry and terminal contract defects into stable violation codes', () => {
    const edges = [
      edgeWithPath('bad', [
        { x: 110, y: 30 },
        { x: 170, y: 75 },
        { x: 300, y: 30 },
      ]),
    ];

    const report = createDisplayRoutingContractReport(edges, nodes, {
      requireCommercialClearance: false,
    });
    const codes = report.violations.map(violation => violation.code);

    expect(report.clean).toBe(false);
    expect(codes).toEqual(expect.arrayContaining([
      'terminal-unanchored',
      'non-orthogonal-segment',
    ]));
  });

  it('keeps final presentation issues separate from the hard geometry report', () => {
    const edges = [
      edgeWithPath('short-stubs', [
        { x: 100, y: 30 },
        { x: 120, y: 30 },
        { x: 280, y: 30 },
        { x: 300, y: 30 },
      ]),
    ];

    const hardReport = getDisplayHardQualityGateReport(edges, nodes, 'polished');
    const report = createDisplayRoutingContractReport(edges, nodes, {
      hardReport,
      requireCommercialClearance: false,
    });

    expect(report.hardReport).toBe(hardReport);
    expect(report.clean).toBe(false);
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'render-unsafe-endpoint-stub',
        phase: 'presentation',
        severity: 'presentation',
        count: 2,
      }),
    ]));
  });
});
