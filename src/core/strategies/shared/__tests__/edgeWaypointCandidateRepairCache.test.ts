import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE,
} from '../edgeBusinessNodeClearanceRepair';
import { createNodeClearanceGraphEvaluationContext } from '../edgeWaypointCandidateRepair';

describe('node-clearance graph evaluation cache', () => {
  it('reuses segment clearance scores across immutable edge copies with the same terminals', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 40, height: 40 } },
      { id: 'blocker', position: { x: 100, y: 40 }, data: {}, measured: { width: 60, height: 60 } },
      { id: 'target', position: { x: 240, y: 0 }, data: {}, measured: { width: 40, height: 40 } },
    ];
    const edge: Edge = { id: 'edge', source: 'source', target: 'target' };
    const copiedEdge: Edge = { ...edge };
    const path = [{ x: 40, y: 20 }, { x: 160, y: 20 }, { x: 240, y: 20 }];
    const context = createNodeClearanceGraphEvaluationContext(nodes);

    const first = context.scorePair(
      path,
      edge,
      COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    );
    const metricsBeforeCopy = context.readMetrics();
    const copied = context.scorePair(
      path,
      copiedEdge,
      COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    );
    const metricsAfterCopy = context.readMetrics();

    expect(copied).toEqual(first);
    expect(metricsAfterCopy.cacheHitCount).toBeGreaterThan(metricsBeforeCopy.cacheHitCount);
    expect(metricsAfterCopy.scannedNodeCount).toBe(metricsBeforeCopy.scannedNodeCount);
  });
});
