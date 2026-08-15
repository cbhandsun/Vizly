import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { auditFinalSameSideEndpointOrder } from '../edgeFinalSameSideEndpointOrderRepair';
import { repairPreferredSourceTrunkBundles } from '../edgePreferredSourceTrunkRepair';

const nodes: Node[] = [
  { id: 'hub', position: { x: 50, y: 100 }, width: 282, height: 118, data: {} },
  { id: 'near', position: { x: 32, y: 378 }, width: 298, height: 118, data: {} },
  { id: 'middle', position: { x: 650, y: 378 }, width: 243, height: 118, data: {} },
  { id: 'far', position: { x: 1286, y: 828 }, width: 296, height: 118, data: {} },
];

const edges: Edge[] = [
  {
    id: 'middle-edge',
    source: 'hub',
    target: 'middle',
    sourceHandle: 'right',
    targetHandle: 'top',
    data: {
      computedPath: [
        { x: 332, y: 159 },
        { x: 731, y: 159 },
        { x: 731, y: 378 },
      ],
    },
  },
  {
    id: 'far-edge',
    source: 'hub',
    target: 'far',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: {
      computedPath: [
        { x: 222, y: 218 },
        { x: 222, y: 275 },
        { x: 302, y: 275 },
        { x: 302, y: 323 },
        { x: 339, y: 323 },
        { x: 339, y: 536 },
        { x: 1434, y: 536 },
        { x: 1434, y: 828 },
      ],
    },
  },
  {
    id: 'near-edge',
    source: 'hub',
    target: 'near',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: {
      computedPath: [
        { x: 121, y: 218 },
        { x: 121, y: 308 },
        { x: 181, y: 308 },
        { x: 181, y: 378 },
      ],
    },
  },
];

const preferredEdges = edges.map(edge => (
  edge.id === 'middle-edge' ? { ...edge, sourceHandle: 'bottom' } : edge
));

describe('repairPreferredSourceTrunkBundles', () => {
  it('restores a three-edge commercial source trunk without changing target suffixes', () => {
    const repaired = repairPreferredSourceTrunkBundles(edges, nodes, preferredEdges);
    const paths = repaired.map(edge => edge.data?.computedPath as Array<{ x: number; y: number }>);
    const trunk = auditFinalSameSideEndpointOrder(repaired, nodes).legalSharedTrunks.find(item => (
      item.nodeId === 'hub'
      && item.role === 'source'
      && item.edgeIds.length === 3
    ));

    expect(repaired).not.toBe(edges);
    expect(repaired.map(edge => edge.sourceHandle)).toEqual(['bottom', 'bottom', 'bottom']);
    expect(paths.map(path => path[0])).toEqual([
      { x: 302, y: 218 },
      { x: 302, y: 218 },
      { x: 302, y: 218 },
    ]);
    expect(paths[0].slice(-2)).toEqual([
      { x: 731, y: 288 },
      { x: 731, y: 378 },
    ]);
    expect(paths[1].at(-1)).toEqual({ x: 1434, y: 828 });
    expect(paths[2].at(-1)).toEqual({ x: 181, y: 378 });
    expect(trunk?.edgeIds).toEqual(['far-edge', 'middle-edge', 'near-edge']);
    expect(trunk?.commonStemLength).toBe(70);
  });

  it('keeps an out-of-envelope side corridor separate from a vertical bundle', () => {
    const corridorNode: Node = {
      id: 'corridor',
      position: { x: 1800, y: 389 },
      width: 240,
      height: 96,
      data: {},
    };
    const corridor: Edge = {
      id: 'corridor-edge',
      source: 'hub',
      target: 'corridor',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 332, y: 159 },
          { x: 420, y: 159 },
          { x: 420, y: 437 },
          { x: 1800, y: 437 },
        ],
      },
    };
    const baseline = [...edges.slice(1), corridor];
    const preferred = baseline.map(edge => (
      edge.id === corridor.id ? { ...edge, sourceHandle: 'bottom' } : edge
    ));

    expect(repairPreferredSourceTrunkBundles(
      baseline,
      [...nodes, corridorNode],
      preferred,
    )).toBe(baseline);
  });

  it('restores a farther outward member without absorbing a nearby side corridor', () => {
    const corridorNode: Node = {
      id: 'corridor',
      position: { x: 1800, y: 389 },
      width: 240,
      height: 96,
      data: {},
    };
    const corridor: Edge = {
      id: 'corridor-edge',
      source: 'hub',
      target: 'corridor',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 332, y: 159 },
          { x: 420, y: 159 },
          { x: 420, y: 437 },
          { x: 1800, y: 437 },
        ],
      },
    };
    const baseline = [...edges, corridor];
    const preferred = baseline.map(edge => (
      edge.id === 'middle-edge' || edge.id === corridor.id
        ? { ...edge, sourceHandle: 'bottom' }
        : edge
    ));

    const repaired = repairPreferredSourceTrunkBundles(
      baseline,
      [...nodes, corridorNode],
      preferred,
    );
    const trunk = auditFinalSameSideEndpointOrder(repaired, [...nodes, corridorNode])
      .legalSharedTrunks.find(item => item.nodeId === 'hub' && item.role === 'source');

    expect(repaired).not.toBe(baseline);
    expect(repaired.find(edge => edge.id === 'middle-edge')?.sourceHandle).toBe('bottom');
    expect(repaired.find(edge => edge.id === corridor.id)).toBe(corridor);
    expect(trunk?.edgeIds).toEqual(['far-edge', 'middle-edge', 'near-edge']);
  });

  it('is a no-op without a trusted preferred-edge snapshot', () => {
    expect(repairPreferredSourceTrunkBundles(edges, nodes, undefined)).toBe(edges);
  });
});
