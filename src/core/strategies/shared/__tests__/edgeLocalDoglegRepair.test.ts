import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairLocalDoglegArtifacts } from '../edgeLocalDoglegRepair';

const baseNodes: Node[] = [
  { id: 'source', position: { x: -80, y: -30 }, data: {}, measured: { width: 60, height: 60 } },
  { id: 'target', position: { x: 220, y: -30 }, data: {}, measured: { width: 60, height: 60 } },
];

describe('edgeLocalDoglegRepair', () => {
  it('flattens a short return notch when the direct lane is clear', () => {
    const edges: Edge[] = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 0, y: 0 },
            { x: 0, y: 40 },
            { x: 80, y: 40 },
            { x: 80, y: 68 },
            { x: 120, y: 68 },
            { x: 120, y: 40 },
            { x: 200, y: 40 },
            { x: 200, y: 0 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, baseNodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 200, y: 40 },
      { x: 200, y: 0 },
    ]);
  });

  it('keeps a short return notch when it routes around an unrelated node', () => {
    const nodes: Node[] = [
      ...baseNodes,
      { id: 'blocker', position: { x: 88, y: -18 }, data: {}, measured: { width: 28, height: 36 } },
    ];
    const computedPath = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 40 },
      { x: 124, y: 40 },
      { x: 124, y: 0 },
      { x: 200, y: 0 },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        data: {
          layoutPathLocked: true,
          computedPath,
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);

    expect((repaired.data as any).computedPath).toEqual(computedPath);
    expect((repaired.data as any).localDoglegRepaired).toBeUndefined();
  });

  it('keeps endpoint-adjacent notches so endpoint stubs remain visible', () => {
    const computedPath = [
      { x: 0, y: 0 },
      { x: 0, y: -48 },
      { x: 12, y: -48 },
      { x: 12, y: 48 },
      { x: 200, y: 48 },
      { x: 200, y: 0 },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        data: {
          layoutPathLocked: true,
          computedPath,
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, baseNodes);

    expect((repaired.data as any).computedPath).toEqual(computedPath);
    expect((repaired.data as any).localDoglegRepaired).toBeUndefined();
  });

  it('flattens a broad return detour when the direct trunk is clear and reduces crossings', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-visibility',
        source: 'l-oms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 916, y: 653 },
            { x: 916, y: 781 },
            { x: 1272, y: 781 },
            { x: 1272, y: 928 },
            { x: 904, y: 928 },
            { x: 904, y: 1450 },
            { x: 1216, y: 1450 },
            { x: 1216, y: 1539 },
          ],
        },
      },
      {
        id: 'edge-tms-bms',
        source: 'tms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 916, y: 931 },
            { x: 916, y: 1000 },
            { x: 660, y: 1000 },
            { x: 660, y: 1089 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'l-oms', position: { x: 827, y: 534 }, data: {}, measured: { width: 179, height: 119 } },
      { id: 'visibility', position: { x: 1100, y: 1539 }, data: {}, measured: { width: 232, height: 119 } },
      { id: 'tms', position: { x: 820, y: 811 }, data: {}, measured: { width: 192, height: 120 } },
      { id: 'bms', position: { x: 576, y: 1089 }, data: {}, measured: { width: 168, height: 118 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 916, y: 653 },
      { x: 916, y: 781 },
      { x: 1272, y: 781 },
      { x: 1272, y: 1450 },
      { x: 1216, y: 1450 },
      { x: 1216, y: 1539 },
    ]);
  });
});
