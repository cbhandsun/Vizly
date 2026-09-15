import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildEdgeSegments,
  calculateEdgePairQuality,
} from '../edgePathQualityGeometry';

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });
const segments = (path: Array<{ x: number; y: number }>, edgeIndex: number) => buildEdgeSegments(path, edgeIndex);

describe('edgePathQualityGeometry shared directed trunks', () => {
  it('explains same-source directed middle trunks with different setup segment indexes', () => {
    const firstPath = [
      { x: 0, y: 0 }, { x: 60, y: 0 },
      { x: 60, y: 80 }, { x: 60, y: 180 },
      { x: 220, y: 180 },
    ];
    const secondPath = [
      { x: 0, y: 0 }, { x: 0, y: 30 },
      { x: 80, y: 30 }, { x: 80, y: 80 },
      { x: 60, y: 80 }, { x: 60, y: 180 },
      { x: 220, y: 220 },
    ];

    const contribution = calculateEdgePairQuality(
      edge('first', 'shared-source', 'first-target'),
      edge('second', 'shared-source', 'second-target'),
      segments(firstPath, 0),
      segments(secondPath, 1),
    );

    expect(contribution.relatedOverlap).toBeGreaterThanOrEqual(100);
    expect(contribution.unexplainedRelatedOverlap).toBe(0);
    expect(contribution.reverseOverlap).toBe(0);
    expect(contribution.unrelatedOverlap).toBe(0);
  });

  it('keeps same-source partial re-merges as unexplained related overlaps', () => {
    const contribution = calculateEdgePairQuality(
      edge('first', 'shared-source', 'first-target'),
      edge('second', 'shared-source', 'second-target'),
      segments([
        { x: 0, y: 0 }, { x: 60, y: 0 },
        { x: 60, y: 80 }, { x: 60, y: 180 },
        { x: 220, y: 180 },
      ], 0),
      segments([
        { x: 0, y: 0 }, { x: 0, y: 30 },
        { x: 80, y: 30 }, { x: 80, y: 120 },
        { x: 60, y: 120 }, { x: 60, y: 180 },
        { x: 220, y: 220 },
      ], 1),
    );

    expect(contribution.relatedOverlap).toBeGreaterThanOrEqual(60);
    expect(contribution.unexplainedRelatedOverlap).toBeGreaterThanOrEqual(60);
  });

  it('keeps unrelated directed overlaps as hard unrelated overlaps', () => {
    const contribution = calculateEdgePairQuality(
      edge('first', 'source-a', 'target-a'),
      edge('second', 'source-b', 'target-b'),
      segments([
        { x: 0, y: 0 }, { x: 60, y: 0 },
        { x: 60, y: 80 }, { x: 60, y: 180 },
      ], 0),
      segments([
        { x: 200, y: 0 }, { x: 200, y: 80 },
        { x: 60, y: 80 }, { x: 60, y: 180 },
      ], 1),
    );

    expect(contribution.relatedOverlap).toBe(0);
    expect(contribution.unrelatedOverlap).toBeGreaterThanOrEqual(100);
    expect(contribution.unexplainedRelatedOverlap).toBe(0);
  });

  it('keeps reverse same-endpoint overlaps as reverse and unexplained', () => {
    const contribution = calculateEdgePairQuality(
      edge('first', 'shared-source', 'first-target'),
      edge('second', 'shared-source', 'second-target'),
      segments([
        { x: 0, y: 0 }, { x: 60, y: 0 },
        { x: 60, y: 80 }, { x: 60, y: 180 },
      ], 0),
      segments([
        { x: 0, y: 0 }, { x: 120, y: 0 },
        { x: 120, y: 180 }, { x: 60, y: 180 },
        { x: 60, y: 80 },
      ], 1),
    );

    expect(contribution.relatedOverlap).toBeGreaterThanOrEqual(100);
    expect(contribution.reverseOverlap).toBeGreaterThanOrEqual(100);
    expect(contribution.unexplainedRelatedOverlap).toBeGreaterThanOrEqual(100);
  });
  it('explains near-pixel same-handle target fan-in within the visual overlap tolerance', () => {
    const first: Edge = {
      ...edge('alert-labor', 'alert', 'labor'),
      targetHandle: 'right',
    };
    const second: Edge = {
      ...edge('operation-labor', 'operation', 'labor'),
      targetHandle: 'right',
    };
    const contribution = calculateEdgePairQuality(
      first,
      second,
      segments([
        { x: 1900, y: 1145.5 }, { x: 2111, y: 1145.5 },
        { x: 2111, y: 1350 }, { x: 2150, y: 1350 },
      ], 0),
      segments([
        { x: 2114, y: 989 }, { x: 2114, y: 1350 },
        { x: 2150, y: 1350 },
      ], 1),
    );

    expect(contribution.relatedOverlap).toBeGreaterThanOrEqual(205);
    expect(contribution.unexplainedRelatedOverlap).toBe(0);
    expect(contribution.reverseOverlap).toBe(0);
  });

  it('keeps near-pixel target fan-in with different handles unexplained', () => {
    const first: Edge = {
      ...edge('alert-labor', 'alert', 'labor'),
      targetHandle: 'right',
    };
    const second: Edge = {
      ...edge('operation-labor', 'operation', 'labor'),
      targetHandle: 'right-alt',
    };
    const contribution = calculateEdgePairQuality(
      first,
      second,
      segments([
        { x: 1900, y: 1145.5 }, { x: 2111, y: 1145.5 },
        { x: 2111, y: 1350 }, { x: 2150, y: 1350 },
      ], 0),
      segments([
        { x: 2114, y: 989 }, { x: 2114, y: 1350 },
        { x: 2150, y: 1350 },
      ], 1),
    );

    expect(contribution.relatedOverlap).toBeGreaterThanOrEqual(205);
    expect(contribution.unexplainedRelatedOverlap).toBeGreaterThanOrEqual(205);
  });
});


