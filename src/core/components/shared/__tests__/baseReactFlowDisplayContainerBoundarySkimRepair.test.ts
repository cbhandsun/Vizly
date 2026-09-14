import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { auditDisplayContainerBoundarySkims } from '../baseReactFlowDisplayContainerBoundarySkim';
import { countRenderUnsafeEndpointStubs } from '../baseReactFlowDisplayEndpointStubRepair';
import { repairDisplayContainerBoundarySkims } from '../baseReactFlowDisplayContainerBoundarySkimRepair';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  type = 'custom',
): Node => ({
  id,
  type,
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: { label: id },
});

const edge = (path: Array<{ x: number; y: number }>): Edge => ({
  id: 'feedback-edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'bottom',
  targetHandle: 'bottom',
  type: 'stablePath',
  data: { computedPath: path },
});

describe('display container boundary skim repair', () => {
  it('moves a long internal route away from a swimlane boundary without breaking hard gates', () => {
    const nodes = [
      node('lane', 40, 40, 360, 280, 'subGroup'),
      node('source', 100, 200, 80, 50),
      node('target', 260, 200, 80, 50),
    ];
    const edges = [edge([
      { x: 140, y: 250 },
      { x: 140, y: 306 },
      { x: 300, y: 306 },
      { x: 300, y: 250 },
    ])];

    const beforeAudit = auditDisplayContainerBoundarySkims(edges, nodes);
    expect(beforeAudit.totalLength).toBeGreaterThanOrEqual(160);
    expect(beforeAudit.edgeIds).toEqual(['feedback-edge']);
    expect(getDisplayHardQualityGateReport(edges, nodes, 'polished').hardClean).toBe(true);

    const repaired = repairDisplayContainerBoundarySkims(edges, nodes, {
      validateCandidate: ({ candidateEdges }) => {
        const report = getDisplayHardQualityGateReport([...candidateEdges], nodes, 'polished');
        return report.hardClean;
      },
    });

    expect(repaired).not.toBe(edges);
    expect(auditDisplayContainerBoundarySkims(repaired, nodes).totalLength).toBe(0);
    expect(getDisplayHardQualityGateReport(repaired, nodes, 'polished')).toMatchObject({
      hardClean: true,
      containerBoundarySkims: 0,
    });
    expect((repaired[0].data?.computedPath as Array<{ x: number; y: number }>)[1]).toEqual({
      x: 140,
      y: 340,
    });
    expect((repaired[0].data?.computedPath as Array<{ x: number; y: number }>)[2]).toEqual({
      x: 300,
      y: 340,
    });
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(0);
  });

  it('moves a single top-boundary route into the container interior', () => {
    const nodes = [
      node('subgroup-策略计算-数据准备', 68, 88, 1546, 192, 'subGroup'),
      node('source', 733, 152, 80, 48),
      node('target', 1423, 152, 80, 48),
    ];
    const edges = [edge([
      { x: 773, y: 152 },
      { x: 773, y: 96 },
      { x: 1463, y: 96 },
      { x: 1463, y: 152 },
    ])];

    expect(auditDisplayContainerBoundarySkims(edges, nodes)).toMatchObject({
      totalLength: 690,
      edgeIds: ['feedback-edge'],
    });

    const rejectedCoordinates: number[] = [];
    const repaired = repairDisplayContainerBoundarySkims(edges, nodes, {
      validateCandidate: ({ candidateEdges }) => {
        const path = candidateEdges[0].data?.computedPath as Array<{ x: number; y: number }>;
        rejectedCoordinates.push(path[1].y);
        return path[1].y === 68;
      },
    });

    expect(auditDisplayContainerBoundarySkims(repaired, nodes).totalLength).toBe(0);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(0);
    expect(rejectedCoordinates).toEqual([68]);
    expect((repaired[0].data?.computedPath as Array<{ x: number; y: number }>)).toEqual([
      { x: 773, y: 152 },
      { x: 773, y: 68 },
      { x: 1463, y: 68 },
      { x: 1463, y: 152 },
    ]);
  });
});



