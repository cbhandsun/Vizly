import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../edgeDetachedOverlapRepair';
import { runEdgeRoutingPipeline } from '../edgeRoutingPipeline';

const node = (
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Node & { positionAbsolute: { x: number; y: number } } => ({
  id,
  type,
  position: { x, y },
  positionAbsolute: { x, y },
  measured: { width, height },
  width,
  height,
  data: {},
});

describe('runEdgeRoutingPipeline display contract', () => {
  it('locks computed paths so the display layer renders the repaired route', async () => {
    const nodes: Node[] = [
      node('source', 'custom', 0, 0, 100, 60),
      node('target', 'custom', 260, 0, 100, 60),
    ];
    const edges: Edge[] = [{
      id: 'source-target',
      source: 'source',
      target: 'target',
      type: 'advanced-smart-step',
    }];

    const [edge] = await runEdgeRoutingPipeline(nodes, edges, { layoutDirection: 'LR' });
    const data = edge.data as any;

    expect(data.computedPath).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    ]));
    expect(data.layoutPathLocked).toBe(true);
    expect(data.runtimeHandleLock).toMatchObject({ source: true, target: true });
  });

  it('keeps exact and side-fixed compound handle identities while routing geometry by side', async () => {
    const nodes: Node[] = [
      node('source', 'custom', 0, 0, 100, 60),
      node('target', 'custom', 0, 260, 100, 60),
    ];
    const input: Edge = {
      id: 'fixed-terminals',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-right-port-7',
      targetHandle: 'target-left-port-3',
      data: {
        manualHandles: { source: true },
        targetPortPolicy: 'strong',
      },
    };
    const positionsBefore = nodes.map(candidate => ({ ...candidate.position }));

    const [routed] = await runEdgeRoutingPipeline(nodes, [input], { layoutDirection: 'TB' });

    expect(routed.sourceHandle).toBe('source-right-port-7');
    expect(routed.targetHandle).toBe('target-left-port-3');
    expect(nodes.map(candidate => candidate.position)).toEqual(positionsBefore);
  });

  it('does not refine a runtime-owned compound handle before a hard-gated route result', async () => {
    const nodes: Node[] = [
      node('source', 'custom', 0, 0, 100, 60),
      node('target', 'custom', 0, 260, 100, 60),
    ];
    const input: Edge = {
      id: 'runtime-terminal',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-right-runtime-port-2',
      targetHandle: 'target-left-runtime-port-4',
      data: { runtimeHandleLock: { source: true, target: true } },
    };

    const [routed] = await runEdgeRoutingPipeline(nodes, [input], { layoutDirection: 'TB' });

    expect(routed.sourceHandle).toBe('source-right-runtime-port-2');
    expect(routed.targetHandle).toBe('target-left-runtime-port-4');
  });
});

describe('separateDetachedParallelOverlaps', () => {
  it('separates long shared middle lanes without moving the target endpoint trunks', () => {
    const nodes: Node[] = [
      node('master-data', 'custom', 300, 2800, 90, 60),
      node('tms-execution', 'custom', 130, 2300, 90, 60),
      node('logistics-oms', 'custom', 200, 744, 180, 60),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-master-data-oms',
        source: 'master-data',
        target: 'logistics-oms',
        data: {
          computedPath: [
            { x: 347, y: 2816 },
            { x: 347, y: 2507 },
            { x: 443, y: 2507 },
            { x: 443, y: 1972 },
            { x: 347, y: 1972 },
            { x: 347, y: 804 },
          ],
        },
      },
      {
        id: 'edge-tms-oms-status',
        source: 'tms-execution',
        target: 'logistics-oms',
        data: {
          computedPath: [
            { x: 178, y: 2330 },
            { x: 178, y: 2181 },
            { x: 443, y: 2181 },
            { x: 443, y: 1972 },
            { x: 242, y: 1972 },
            { x: 242, y: 804 },
          ],
        },
      },
    ];

    const result = separateDetachedParallelOverlaps(edges, nodes);
    const first = (result[0].data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const second = (result[1].data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(maxParallelOverlap(first, second)).toBeLessThan(96);
    expect(first[0]).toEqual({ x: 347, y: 2816 });
    expect(first[first.length - 1]).toEqual({ x: 347, y: 804 });
    expect(second[0]).toEqual({ x: 178, y: 2330 });
    expect(second[second.length - 1]).toEqual({ x: 242, y: 804 });
  });
});

function maxParallelOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): number {
  let maxOverlap = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      maxOverlap = Math.max(maxOverlap, segmentOverlap(a[i], a[i + 1], b[j], b[j + 1]));
    }
  }
  return maxOverlap;
}

function segmentOverlap(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): number {
  const aVertical = Math.abs(a1.x - a2.x) < 1;
  const bVertical = Math.abs(b1.x - b2.x) < 1;
  if (aVertical !== bVertical) return 0;
  if (aVertical) {
    if (Math.abs(a1.x - b1.x) > 1) return 0;
    return Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y))
      - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
  }
  if (Math.abs(a1.y - b1.y) > 1) return 0;
  return Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x))
    - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
}
