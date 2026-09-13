import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  selectHardCleanDisplayParallelLaneCandidate,
  separateBaseReactFlowDisplayParallelLanes,
} from '../baseReactFlowDisplayParallelLaneSeparation';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const node = (id: string, x: number, y: number, width = 80, height = 60, type?: string): Node => ({
  id,
  type,
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

const parallelEdge = (id: string, path: Array<{ x: number; y: number }>): Edge => ({
  id,
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'advanced-smart-step',
  data: { computedPath: path },
});

const autoPortParallelEdge = (id: string, path: Array<{ x: number; y: number }>): Edge => ({
  id,
  source: 'source',
  target: 'target',
  sourceHandle: 'bottom',
  targetHandle: 'left',
  type: 'advanced-smart-step',
  data: { computedPath: path },
});

const readPath = (edge: Edge): Array<{ x: number; y: number }> => {
  const data = edge.data as { computedPath?: Array<{ x: number; y: number }> } | undefined;
  return data?.computedPath ?? [];
};

describe('separateBaseReactFlowDisplayParallelLanes', () => {
  it('separates same-terminal directed parallel edge trunks behind the hard geometry gate', () => {
    const nodes = [
      node('source', 0, 0),
      node('target', 300, 160),
    ];
    const sharedPath = [
      { x: 80, y: 30 },
      { x: 190, y: 30 },
      { x: 190, y: 190 },
      { x: 300, y: 190 },
    ];
    const baseline = [
      parallelEdge('edge-b', sharedPath),
      parallelEdge('edge-a', sharedPath),
    ];

    const separated = separateBaseReactFlowDisplayParallelLanes(baseline);
    const byId = new Map(separated.map(edge => [edge.id, edge]));
    const firstPath = readPath(byId.get('edge-a')!);
    const secondPath = readPath(byId.get('edge-b')!);
    const hardReport = getDisplayHardQualityGateReport(separated, nodes, 'polished');

    expect(firstPath[1].x).toBe(180);
    expect(firstPath[2].x).toBe(180);
    expect(secondPath[1].x).toBe(200);
    expect(secondPath[2].x).toBe(200);
    expect(hardReport.hardClean, JSON.stringify({ hardReport, separated }, null, 2)).toBe(true);
    expect(calculateEdgePathQualityScore(separated).strictCrossings).toBe(0);
  });

  it('leaves a single directed route geometry unchanged', () => {
    const [parallel] = separateBaseReactFlowDisplayParallelLanes([
      parallelEdge('edge-a', [
        { x: 80, y: 30 },
        { x: 190, y: 30 },
        { x: 190, y: 190 },
        { x: 300, y: 190 },
      ]),
      parallelEdge('edge-b', [
        { x: 80, y: 30 },
        { x: 190, y: 30 },
        { x: 190, y: 190 },
        { x: 300, y: 190 },
      ]),
    ]);

    const [single] = separateBaseReactFlowDisplayParallelLanes([parallel]);
    expect(readPath(single)).toEqual(readPath(parallel));
  });

  it('spreads a four-edge parallel bundle across deterministic internal lanes', () => {
    const sharedPath = [
      { x: 80, y: 30 },
      { x: 190, y: 30 },
      { x: 190, y: 190 },
      { x: 300, y: 190 },
    ];
    const separated = separateBaseReactFlowDisplayParallelLanes([
      parallelEdge('edge-d', sharedPath),
      parallelEdge('edge-b', sharedPath),
      parallelEdge('edge-a', sharedPath),
      parallelEdge('edge-c', sharedPath),
    ]);
    const byId = new Map(separated.map(edge => [edge.id, edge]));

    expect(readPath(byId.get('edge-a')!)[1].x).toBe(160);
    expect(readPath(byId.get('edge-b')!)[1].x).toBe(180);
    expect(readPath(byId.get('edge-c')!)[1].x).toBe(200);
    expect(readPath(byId.get('edge-d')!)[1].x).toBe(220);
  });

  it('spreads browser-emitted three-point L routes while preserving terminal directions', () => {
    const nodes = [
      node('source', 120, 220, 120, 72),
      node('target', 520, 380, 120, 72),
    ];
    const sharedPath = [
      { x: 180, y: 292 },
      { x: 180, y: 416 },
      { x: 520, y: 416 },
    ];
    const baseline = [
      autoPortParallelEdge('edge-d', sharedPath),
      autoPortParallelEdge('edge-b', sharedPath),
      autoPortParallelEdge('edge-a', sharedPath),
      autoPortParallelEdge('edge-c', sharedPath),
    ];
    const rawSeparated = separateBaseReactFlowDisplayParallelLanes(baseline);
    const hardReport = getDisplayHardQualityGateReport(rawSeparated, nodes, 'polished');
    expect(hardReport.hardClean, JSON.stringify({ hardReport, rawSeparated }, null, 2))
      .toBe(true);
    const separated = selectHardCleanDisplayParallelLaneCandidate(baseline, nodes);
    const byId = new Map(separated.map(edge => [edge.id, edge]));
    const firstPath = readPath(byId.get('edge-a')!);
    const lastPath = readPath(byId.get('edge-d')!);

    expect(firstPath).toEqual([
      { x: 180, y: 292 },
      { x: 180, y: 348 },
      { x: 204, y: 348 },
      { x: 204, y: 416 },
      { x: 520, y: 416 },
    ]);
    expect(readPath(byId.get('edge-b')!)[2].x).toBe(228);
    expect(readPath(byId.get('edge-c')!)[2].x).toBe(252);
    expect(lastPath[2].x).toBe(276);
    expect(getDisplayHardQualityGateReport(separated, nodes, 'polished').hardClean)
      .toBe(true);
  });

  it('keeps the original route bundle when the separated candidate fails the hard gate', () => {
    const nodes = [
      node('source', 0, 0),
      node('target', 300, 160),
      node('cross-left', 90, 70, 80, 60, 'group'),
      node('cross-right', 185, 70, 80, 60, 'group'),
    ];
    const sharedPath = [
      { x: 80, y: 30 },
      { x: 190, y: 30 },
      { x: 190, y: 190 },
      { x: 300, y: 190 },
    ];
    const baseline = [
      parallelEdge('edge-a', sharedPath),
      parallelEdge('edge-b', sharedPath),
      {
        id: 'crossing-guard',
        source: 'cross-left',
        target: 'cross-right',
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'advanced-smart-step',
        data: { computedPath: [{ x: 170, y: 100 }, { x: 185, y: 100 }] },
      },
    ];
    const selected = selectHardCleanDisplayParallelLaneCandidate(baseline, nodes);

    expect(getDisplayHardQualityGateReport(separateBaseReactFlowDisplayParallelLanes(baseline), nodes, 'polished').hardClean)
      .toBe(false);
    expect(selected.map(readPath)).toEqual(baseline.map(readPath));
  });
});
