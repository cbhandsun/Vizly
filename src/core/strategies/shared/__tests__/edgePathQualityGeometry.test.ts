import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildEdgeSegments,
  calculateEdgePairQuality,
  calculateSingleEdgeQuality,
  getEdgePath,
} from '../edgePathQualityGeometry';

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });

describe('edgePathQualityGeometry', () => {
  it('coerces finite coordinates and rejects malformed path containers', () => {
    const input = {
      ...edge('edge', 'a', 'b'),
      data: {
        computedPath: [
          { x: '10', y: 20 },
          { x: Number.NaN, y: 30 },
          { x: 40, y: Number.POSITIVE_INFINITY },
        ],
      },
    } as unknown as Edge;

    expect(getEdgePath(input)).toEqual([{ x: 10, y: 20 }]);
    expect(getEdgePath({ ...input, data: { computedPath: null } })).toEqual([]);
  });

  it('scores orthogonal path length and bends without non-orthogonal penalties', () => {
    const score = calculateSingleEdgeQuality([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ]);

    expect(score.nonOrthogonalSegments).toBe(0);
    expect(score.bends).toBe(1);
    expect(score.totalLength).toBe(140);
  });

  it('detects one strict crossing between unrelated orthogonal edges', () => {
    const horizontalPath = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
    const verticalPath = [{ x: 50, y: 0 }, { x: 50, y: 100 }];
    const contribution = calculateEdgePairQuality(
      edge('horizontal', 'a', 'b'),
      edge('vertical', 'c', 'd'),
      buildEdgeSegments(horizontalPath, 0),
      buildEdgeSegments(verticalPath, 1),
    );

    expect(contribution.strictCrossings).toBe(1);
    expect(contribution.unrelatedOverlap).toBe(0);
  });

  it('counts a crossing one pixel inside a bend but excludes a true endpoint contact', () => {
    const horizontal = buildEdgeSegments([
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ], 0);
    const nearBend = calculateEdgePairQuality(
      edge('horizontal', 'a', 'b'),
      edge('near-bend', 'c', 'd'),
      horizontal,
      buildEdgeSegments([{ x: 1, y: 0 }, { x: 1, y: 100 }], 1),
    );
    const endpointContact = calculateEdgePairQuality(
      edge('horizontal', 'a', 'b'),
      edge('endpoint-contact', 'e', 'f'),
      horizontal,
      buildEdgeSegments([{ x: 0, y: 0 }, { x: 0, y: 100 }], 1),
    );

    expect(nearBend.strictCrossings).toBe(1);
    expect(endpointContact.strictCrossings).toBe(0);
  });

  it('excludes only a shared endpoint T-junction while preserving an internal related crossing', () => {
    const first = edge('first', 'shared-source', 'first-target');
    const second = edge('second', 'shared-source', 'second-target');
    const endpointJunction = calculateEdgePairQuality(
      first,
      second,
      buildEdgeSegments([{ x: 0, y: 0 }, { x: 0, y: 100 }], 0),
      buildEdgeSegments([{ x: -0.25, y: 0 }, { x: 100, y: 0 }], 1),
    );
    const internalCrossing = calculateEdgePairQuality(
      first,
      second,
      buildEdgeSegments([{ x: 0, y: 0 }, { x: 0, y: 100 }], 0),
      buildEdgeSegments([
        { x: 100, y: 0 }, { x: 100, y: 50 },
        { x: -100, y: 50 }, { x: -100, y: 100 },
      ], 1),
    );

    expect(endpointJunction.strictCrossings).toBe(0);
    expect(internalCrossing.strictCrossings).toBe(1);
  });

  it('recognizes a visually coincident same-source trunk across a three-pixel lane drift', () => {
    const firstPath = [
      { x: 0, y: 0 },
      { x: 0, y: 72 },
      { x: 267, y: 72 },
      { x: 267, y: 185 },
    ];
    const secondPath = [
      { x: 0, y: 0.5 },
      { x: 0, y: 72 },
      { x: 264, y: 72 },
      { x: 264, y: 300 },
    ];
    const contribution = calculateEdgePairQuality(
      edge('first', 'shared-source', 'first-target'),
      edge('second', 'shared-source', 'second-target'),
      buildEdgeSegments(firstPath, 0),
      buildEdgeSegments(secondPath, 1),
    );

    expect(contribution.relatedOverlap).toBeGreaterThanOrEqual(113);
    expect(contribution.unexplainedRelatedOverlap).toBe(0);
    expect(contribution.reverseOverlap).toBe(0);
  });

  it('still penalizes a near-parallel overlap when its source prefix is not continuous', () => {
    const firstPath = [
      { x: 0, y: 0 },
      { x: 0, y: 72 },
      { x: 267, y: 72 },
      { x: 267, y: 185 },
    ];
    const brokenPrefixPath = [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 10, y: 40 },
      { x: 10, y: 72 },
      { x: 264, y: 72 },
      { x: 264, y: 300 },
    ];
    const contribution = calculateEdgePairQuality(
      edge('first', 'shared-source', 'first-target'),
      edge('broken-prefix', 'shared-source', 'second-target'),
      buildEdgeSegments(firstPath, 0),
      buildEdgeSegments(brokenPrefixPath, 1),
    );

    expect(contribution.unexplainedRelatedOverlap).toBeGreaterThanOrEqual(113);
  });

  it('permits a directed peer trunk that merges distinct ports on the same source', () => {
    const rightPortBranch: Edge = {
      ...edge('right-port', 'shared-source', 'right-target'),
      sourceHandle: 'right',
    };
    const bottomPortBranch: Edge = {
      ...edge('bottom-port', 'shared-source', 'bottom-target'),
      sourceHandle: 'bottom',
    };
    const rightPath = [
      { x: 0, y: 0 }, { x: 55, y: 0 },
      { x: 55, y: 499 }, { x: 300, y: 499 },
    ];
    const bottomPath = [
      { x: 0, y: -0.5 }, { x: 0, y: 55.5 },
      { x: 55, y: 55.5 }, { x: 55, y: 403 }, { x: 300, y: 403 },
    ];
    const contribution = calculateEdgePairQuality(
      rightPortBranch,
      bottomPortBranch,
      buildEdgeSegments(rightPath, 0),
      buildEdgeSegments(bottomPath, 1),
    );

    expect(contribution.relatedOverlap).toBe(348);
    expect(contribution.unexplainedRelatedOverlap).toBe(0);
    expect(contribution.reverseOverlap).toBe(0);
  });

  it('keeps a partial different-port overlap outside the peer-trunk contract', () => {
    const rightPortBranch: Edge = {
      ...edge('right-port', 'shared-source', 'right-target'),
      sourceHandle: 'right',
    };
    const bottomPortBranch: Edge = {
      ...edge('bottom-port', 'shared-source', 'bottom-target'),
      sourceHandle: 'bottom',
    };
    const contribution = calculateEdgePairQuality(
      rightPortBranch,
      bottomPortBranch,
      buildEdgeSegments([
        { x: 0, y: 0 }, { x: 55, y: 0 },
        { x: 55, y: 300 }, { x: 300, y: 300 },
      ], 0),
      buildEdgeSegments([
        { x: 0, y: -1 }, { x: 0, y: 100 },
        { x: 55, y: 100 }, { x: 55, y: 400 }, { x: 300, y: 400 },
      ], 1),
    );

    expect(contribution.relatedOverlap).toBe(200);
    expect(contribution.unexplainedRelatedOverlap).toBe(200);
  });

  it('permits only an exact 24px bounded crossing junction between unrelated edges', () => {
    const blocker = [{ x: 0, y: 50 }, { x: 120, y: 50 }];
    const boundedJunction = [
      { x: 48, y: 0 },
      { x: 48, y: 50 },
      { x: 72, y: 50 },
      { x: 72, y: 100 },
    ];
    const contribution = calculateEdgePairQuality(
      edge('blocker', 'a', 'b'),
      edge('junction', 'c', 'd'),
      buildEdgeSegments(blocker, 0),
      buildEdgeSegments(boundedJunction, 1),
    );

    expect(calculateSingleEdgeQuality(boundedJunction).tinyInteriorDoglegs).toBe(0);
    expect(contribution).toMatchObject({
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
    });
  });

  it('keeps longer and same-side unrelated overlaps as hard defects', () => {
    const blocker = [{ x: 0, y: 50 }, { x: 120, y: 50 }];
    const longerJunction = [
      { x: 40, y: 0 },
      { x: 40, y: 50 },
      { x: 72, y: 50 },
      { x: 72, y: 100 },
    ];
    const sameSideStep = [
      { x: 48, y: 0 },
      { x: 48, y: 50 },
      { x: 72, y: 50 },
      { x: 72, y: 0 },
    ];

    const score = (path: Array<{ x: number; y: number }>) => calculateEdgePairQuality(
      edge('blocker', 'a', 'b'),
      edge('candidate', 'c', 'd'),
      buildEdgeSegments(blocker, 0),
      buildEdgeSegments(path, 1),
    );
    expect(score(longerJunction).unrelatedOverlap).toBe(32);
    expect(score(sameSideStep).unrelatedOverlap).toBe(24);
  });
});
