import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { auditFinalSameSideEndpointOrder } from '../edgeFinalSameSideEndpointOrderRepair';
import { repairOverextendedTargetTrunkCorridors } from '../edgeOverextendedTargetTrunkRepair';

type Point = { x: number; y: number };

const path = (edge: Edge): Point[] => (
  (edge.data?.computedPath ?? []) as Point[]
);

describe('repairOverextendedTargetTrunkCorridors', () => {
  it('keeps empty, parentless, and non-overextended inputs unchanged', () => {
    const emptyEdges: Edge[] = [];
    expect(repairOverextendedTargetTrunkCorridors(emptyEdges, [])).toBe(emptyEdges);

    const nodes: Node[] = [
      ...['first', 'second', 'third'].map((id, index): Node => ({
        id, position: { x: 0, y: index * 100 }, width: 80, height: 60, data: {},
      })),
      { id: 'target', position: { x: 300, y: 100 }, width: 80, height: 60, data: {} },
    ];
    const edges: Edge[] = ['first', 'second', 'third'].map((source, index) => ({
      id: `${source}-target`, source, target: 'target', targetHandle: 'left',
      data: { computedPath: [
        { x: 80, y: 30 + index * 100 },
        { x: 120, y: 30 + index * 100 },
        { x: 120, y: 130 },
        { x: 240, y: 130 },
        { x: 300, y: 130 },
      ] },
    }));

    expect(repairOverextendedTargetTrunkCorridors(edges, nodes)).toBe(edges);
  });

  it('reclaims every member to the shared source-parent boundary atomically', () => {
    const nodes: Node[] = [
      {
        id: 'domain', type: 'titleGroup', position: { x: 0, y: 0 },
        width: 600, height: 500, measured: { width: 600, height: 500 }, data: {},
      },
      ...['first', 'second', 'third'].map((id, index): Node => ({
        id,
        type: 'custom',
        parentId: 'domain',
        position: { x: 100, y: 80 + index * 120 },
        width: 100,
        height: 80,
        measured: { width: 100, height: 80 },
        data: {},
      })),
      {
        id: 'target', type: 'custom', position: { x: 800, y: 200 },
        width: 100, height: 100, measured: { width: 100, height: 100 }, data: {},
      },
    ];
    const edges: Edge[] = ['first', 'second', 'third'].map((source, index) => ({
      id: `${source}-target`,
      source,
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 200, y: 120 + index * 120 },
          { x: 260, y: 120 + index * 120 },
          { x: 260, y: 160 + index * 30 },
          { x: -100, y: 160 + index * 30 },
          { x: -100, y: 250 },
          { x: 800, y: 250 },
        ],
      },
    }));

    const repaired = repairOverextendedTargetTrunkCorridors(edges, nodes);
    const order = auditFinalSameSideEndpointOrder(repaired, nodes);
    const targetTrunk = order.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'target' && trunk.role === 'target'
    ));

    expect(repaired).not.toBe(edges);
    expect(repaired.every(edge => Math.min(...path(edge).map(point => point.x)) >= 0)).toBe(true);
    expect(targetTrunk?.edgeIds).toEqual([
      'first-target',
      'second-target',
      'third-target',
    ]);
    expect(targetTrunk?.commonStemLength).toBe(800);
    expect(repairOverextendedTargetTrunkCorridors(repaired, nodes)).toBe(repaired);

    const canonicalEdges: Edge[] = edges.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        computedPath: path(edge).map(point => ({
          x: point.x === -100 ? 0 : point.x,
          y: point.y,
        })),
      },
    }));
    const annotated = repairOverextendedTargetTrunkCorridors(canonicalEdges, nodes);
    expect(annotated).not.toBe(canonicalEdges);
    expect(annotated.map(path)).toEqual(canonicalEdges.map(path));
    expect(annotated.every(edge => (
      edge.data?.overextendedTargetTrunkCorridorReclaimed === true
    ))).toBe(true);
    expect(repairOverextendedTargetTrunkCorridors(annotated, nodes)).toBe(annotated);
  });
});
