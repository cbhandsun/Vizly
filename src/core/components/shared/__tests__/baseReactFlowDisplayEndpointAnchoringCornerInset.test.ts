// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { anchorComputedDisplayEdgeEndpoints } from '../baseReactFlowDisplayEndpointAnchoring';
import { fastDisplayHardSafetyIsClean } from '../baseReactFlowFastEdgeSafety';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 200 },
    data: { layoutDirection: 'TB' },
    measured: { width: 100, height: 60 },
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    data: {},
    measured: { width: 100, height: 60 },
  },
];

describe('baseReactFlowDisplayEndpointAnchoring terminal placement', () => {
  it('centers a router-owned terminal when it is the only endpoint on a node side', () => {
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'corner-adjacent-terminal',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 2, y: 260 },
          { x: 2, y: 320 },
          { x: 350, y: 320 },
          { x: 350, y: 0 },
        ],
      },
    }], nodes);
    const computedPath = (result.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(computedPath[0]).toEqual({ x: 50, y: 260 });
    expect(computedPath[1]).toEqual({ x: 50, y: 320 });
    expect(result.data?.renderPortCenterAligned).toBe(true);
    expect(computedPath.every((point, index) => (
      index === 0 || point.x === computedPath[index - 1].x || point.y === computedPath[index - 1].y
    ))).toBe(true);
    expect(fastDisplayHardSafetyIsClean([result], nodes)).toBe(true);
  });

  it('keeps multiple auto terminals on the same node side distributed instead of collapsing them to center', () => {
    const [first, second] = anchorComputedDisplayEdgeEndpoints([
      {
        id: 'first-bottom-terminal',
        source: 'source',
        target: 'target-a',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: {
          computedPath: [
            { x: 16, y: 260 },
            { x: 16, y: 320 },
            { x: 350, y: 320 },
            { x: 350, y: 0 },
          ],
        },
      },
      {
        id: 'second-bottom-terminal',
        source: 'source',
        target: 'target-b',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: {
          computedPath: [
            { x: 84, y: 260 },
            { x: 84, y: 344 },
            { x: 520, y: 344 },
            { x: 520, y: 0 },
          ],
        },
      },
    ], [
      nodes[0],
      { id: 'target-a', position: { x: 300, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
      { id: 'target-b', position: { x: 470, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
    ]);
    const firstPath = (first.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const secondPath = (second.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(firstPath[0]).toEqual({ x: 16, y: 260 });
    expect(secondPath[0]).toEqual({ x: 84, y: 260 });
    expect(first.data?.renderPortCenterAligned).toBeUndefined();
    expect(second.data?.renderPortCenterAligned).toBeUndefined();
  });

  it('preserves exact authored terminal positions when they are close to node corners', () => {
    const originalPath = [
      { x: 2, y: 260 },
      { x: 2, y: 320 },
      { x: 350, y: 320 },
      { x: 350, y: 0 },
    ];
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'exact-corner-terminal',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-bottom-port-1',
      targetHandle: 'target-top-port-1',
      data: {
        computedPath: originalPath,
        manualHandles: { source: true, target: true },
      },
    }], nodes);

    expect(result.data?.computedPath).toEqual(originalPath);
  });
});
