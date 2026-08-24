import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createEdgeWaypointRefinementDiagnostics,
  reduceEdgeCrossingsWithWaypoints,
} from '../edgeRoutingWaypointRefinement';

const routedEdge = (
  id: string,
  source: string,
  target: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({ id, source, target, data: { computedPath } });

describe('waypoint node visual index parity', () => {
  it.each(['TB', 'BT', 'LR', 'RL'])('matches full node scans for %s routing', direction => {
    const edges: Edge[] = [
      routedEdge('first', 'source-a', 'target-a', [
        { x: 0, y: 0 },
        { x: 0, y: 180 },
        { x: 520, y: 180 },
        { x: 520, y: 420 },
      ]),
      routedEdge('second', 'source-b', 'target-b', [
        { x: 280, y: -80 },
        { x: 280, y: 500 },
      ]),
      routedEdge('third', 'source-c', 'target-c', [
        { x: -120, y: 300 },
        { x: 640, y: 300 },
      ]),
    ];
    const nodes: Node[] = [
      ...Array.from({ length: 80 }, (_, index): Node => ({
        id: `remote-${index}`,
        type: 'task',
        position: {
          x: 2_000 + (index % 10) * 180,
          y: 2_000 + Math.floor(index / 10) * 140,
        },
        measured: { width: 96, height: 56 },
        data: {},
      })),
      {
        id: 'nearby-business',
        type: 'task',
        position: { x: 340, y: 220 },
        measured: { width: 96, height: 56 },
        data: {},
      },
      {
        id: 'nearby-container',
        type: 'group',
        position: { x: -160, y: -120 },
        measured: { width: 880, height: 680 },
        data: {},
      },
    ];
    const indexedDiagnostics = createEdgeWaypointRefinementDiagnostics();
    const fullScanDiagnostics = createEdgeWaypointRefinementDiagnostics();

    const indexed = reduceEdgeCrossingsWithWaypoints(edges, nodes, direction, {
      diagnostics: indexedDiagnostics,
    });
    const fullScan = reduceEdgeCrossingsWithWaypoints(edges, nodes, direction, {
      diagnostics: fullScanDiagnostics,
      disableNodeVisualIndex: true,
    });

    expect(indexed).toEqual(fullScan);
    expect(indexedDiagnostics.evaluationCount).toBe(fullScanDiagnostics.evaluationCount);
    expect(indexedDiagnostics.scannedNodeCount)
      .toBeLessThan(fullScanDiagnostics.scannedNodeCount);
  });
});
