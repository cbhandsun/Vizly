import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { findBaseReactFlowBlockedContextEdgePromotions } from '../baseReactFlowDisplayIncrementalPromotion';
import {
  createDisplayRoutingSegmentSpatialIndex,
  createDisplayRoutingWorkerSpatialSnapshot,
} from '../baseReactFlowDisplayWorkerSpatialSnapshot';

const changedNode: Node = {
  id: 'changed',
  type: 'task',
  position: { x: 100, y: 100 },
  measured: { width: 80, height: 60 },
  data: {},
};

const edge = (
  id: string,
  y: number,
  source = `${id}-source`,
  target = `${id}-target`,
): Edge => ({
  id,
  source,
  target,
  data: {
    computedPath: [{ x: 0, y }, { x: 300, y }],
  },
});

describe('Worker-private display routing spatial snapshot', () => {
  it('uses the segment index only to prune before the exact promotion audit', () => {
    const edges = [
      edge('near', 90),
      edge('far', 400),
      edge('incident', 120, 'changed', 'incident-target'),
    ];
    const index = createDisplayRoutingSegmentSpatialIndex(edges);
    expect(index).not.toBeNull();
    const candidateEdgeIds = index?.queryEdgeIds(
      [{ x: 100, y: 100, width: 80, height: 60 }],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    );
    expect(candidateEdgeIds).not.toBeNull();
    expect(candidateEdgeIds).toEqual(new Set(['near', 'incident']));

    const fullScan = findBaseReactFlowBlockedContextEdgePromotions({
      edges,
      nodes: [changedNode],
      changedNodeIds: ['changed'],
      contextEdgeIds: [],
      mutableEdgeIds: ['incident'],
    });
    const indexedScan = findBaseReactFlowBlockedContextEdgePromotions({
      edges,
      nodes: [changedNode],
      changedNodeIds: ['changed'],
      contextEdgeIds: [],
      mutableEdgeIds: ['incident'],
      candidateEdgeIds: candidateEdgeIds ?? undefined,
    });
    expect(indexedScan).toEqual(fullScan);
    expect(indexedScan).toEqual(['near']);
    expect(index?.readMetrics()).toMatchObject({
      indexedSegmentCount: 3,
      queryCount: 1,
      candidateEdgeCount: 2,
    });
  });

  it('binds segment and node indexes to the exact output route signature', () => {
    const edges = [edge('near', 90), edge('far', 400)];
    const index = createDisplayRoutingSegmentSpatialIndex(edges);
    if (!index) throw new Error('expected a valid segment index');
    expect(createDisplayRoutingSegmentSpatialIndex(edges, 'route-v2:forged')).toBeNull();

    const snapshot = createDisplayRoutingWorkerSpatialSnapshot({
      nodes: [changedNode],
      edges,
      outputRouteSignature: index.outputRouteSignature,
    });
    expect(snapshot?.outputRouteSignature).toBe(index.outputRouteSignature);
    expect(snapshot?.nodeClearanceIndex.score(
      getDisplayComputedPath(edges[0]),
      edges[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBeGreaterThan(0);
  });

  it('fails closed for duplicate identifiers and unbounded queries', () => {
    const duplicateEdges = [edge('duplicate', 0), edge('duplicate', 100)];
    expect(createDisplayRoutingSegmentSpatialIndex(duplicateEdges)).toBeNull();

    const index = createDisplayRoutingSegmentSpatialIndex([edge('bounded', 0)]);
    expect(index?.queryEdgeIds([{
      x: 0,
      y: 0,
      width: Number.POSITIVE_INFINITY,
      height: 10,
    }])).toBeNull();
    expect(index?.queryEdgeIds([{ x: 0, y: 0, width: 10, height: 10 }], -1)).toBeNull();
    expect(index?.queryEdgeIds([{
      x: -1_000_000,
      y: -1_000_000,
      width: 2_000_000,
      height: 2_000_000,
    }])).toBeNull();
  });

  it('keeps indexed promotion parity across a seeded mixed-axis matrix', () => {
    let seed = 0x51f15e;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const edges: Edge[] = Array.from({ length: 80 }, (_, index) => {
      const horizontal = index % 2 === 0;
      const axis = Math.round((random() * 900) - 300);
      const start = Math.round((random() * 500) - 250);
      const length = 60 + Math.round(random() * 500);
      return {
        id: `matrix-${index}`,
        source: `source-${index}`,
        target: `target-${index}`,
        data: {
          computedPath: horizontal
            ? [{ x: start, y: axis }, { x: start + length, y: axis }]
            : [{ x: axis, y: start }, { x: axis, y: start + length }],
        },
      };
    });
    const index = createDisplayRoutingSegmentSpatialIndex(edges);
    if (!index) throw new Error('expected seeded matrix index');

    for (let caseIndex = 0; caseIndex < 20; caseIndex += 1) {
      const matrixNode: Node = {
        id: `changed-${caseIndex}`,
        type: 'task',
        position: {
          x: Math.round((random() * 600) - 200),
          y: Math.round((random() * 600) - 200),
        },
        measured: {
          width: 40 + Math.round(random() * 120),
          height: 40 + Math.round(random() * 120),
        },
        data: {},
      };
      const rect = {
        x: matrixNode.position.x,
        y: matrixNode.position.y,
        width: matrixNode.measured?.width ?? 0,
        height: matrixNode.measured?.height ?? 0,
      };
      const candidateEdgeIds = index.queryEdgeIds(
        [rect],
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      );
      expect(candidateEdgeIds).not.toBeNull();
      const fullScan = findBaseReactFlowBlockedContextEdgePromotions({
        edges,
        nodes: [matrixNode],
        changedNodeIds: [matrixNode.id],
        contextEdgeIds: [],
      });
      const indexedScan = findBaseReactFlowBlockedContextEdgePromotions({
        edges,
        nodes: [matrixNode],
        changedNodeIds: [matrixNode.id],
        contextEdgeIds: [],
        candidateEdgeIds: candidateEdgeIds ?? undefined,
      });
      expect(indexedScan).toEqual(fullScan);
    }
  });
});
