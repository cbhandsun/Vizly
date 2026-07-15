import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createEndpointLaneInteractionContext,
  endpointLaneParallelOverlapLength,
  endpointLaneSegmentDirection,
  endpointLaneStrictCrosses,
  endpointLaneToSegments,
  shouldConsiderEndpointLaneStrictCrossing,
  type EndpointLaneInteractionMetrics,
  type EndpointLanePoint,
} from '../edgeEndpointLaneInteractionContext';

const edge = (
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
): Edge => ({ id, source, target, sourceHandle });

function evaluateWithLegacyScans(
  candidate: readonly EndpointLanePoint[],
  candidateEdge: Edge,
  paths: ReadonlyMap<string, readonly EndpointLanePoint[]>,
  edgesById: ReadonlyMap<string, Edge>,
): EndpointLaneInteractionMetrics {
  const candidateSegments = endpointLaneToSegments(candidate);
  let crossings = 0;
  for (const [otherId, otherPath] of paths) {
    if (otherId === candidateEdge.id) continue;
    const other = edgesById.get(otherId);
    if (!other || !shouldConsiderEndpointLaneStrictCrossing(candidateEdge, other)) continue;
    for (const first of candidateSegments) {
      for (const second of endpointLaneToSegments(otherPath)) {
        if (endpointLaneStrictCrosses(first, second)) crossings += 1;
      }
    }
  }

  let totalCrossings = 0;
  for (const [otherId, otherPath] of paths) {
    if (otherId === candidateEdge.id) continue;
    for (const first of candidateSegments) {
      for (const second of endpointLaneToSegments(otherPath)) {
        if (endpointLaneStrictCrosses(first, second)) totalCrossings += 1;
      }
    }
  }

  let oppositeOverlap = 0;
  for (const [otherId, otherPath] of paths) {
    if (otherId === candidateEdge.id) continue;
    const other = edgesById.get(otherId);
    if (!other || other.source === candidateEdge.source || other.target === candidateEdge.target) continue;
    for (const first of candidateSegments) {
      for (const second of endpointLaneToSegments(otherPath)) {
        if (endpointLaneSegmentDirection(first) * endpointLaneSegmentDirection(second) >= 0) continue;
        oppositeOverlap += endpointLaneParallelOverlapLength(first, second);
      }
    }
  }

  return { crossings, totalCrossings, oppositeOverlap };
}

function expectParity(
  candidate: readonly EndpointLanePoint[],
  candidateEdge: Edge,
  paths: ReadonlyMap<string, readonly EndpointLanePoint[]>,
  edgesById: ReadonlyMap<string, Edge>,
): void {
  expect(createEndpointLaneInteractionContext(candidateEdge, paths, edgesById).evaluate(candidate))
    .toEqual(evaluateWithLegacyScans(candidate, candidateEdge, paths, edgesById));
}

describe('createEndpointLaneInteractionContext', () => {
  it('matches the legacy scans for empty and invalid geometry', () => {
    const candidateEdge = edge('candidate', 'source', 'target');
    const invalidPaths = new Map<string, readonly EndpointLanePoint[]>([
      ['diagonal', [{ x: 0, y: 0 }, { x: 20, y: 20 }]],
      ['nan', [{ x: Number.NaN, y: 0 }, { x: 20, y: 0 }]],
      ['infinite', [{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }]],
    ]);
    const edgesById = new Map<string, Edge>([
      ['diagonal', edge('diagonal', 'other-a', 'other-b')],
      ['nan', edge('nan', 'other-c', 'other-d')],
      ['infinite', edge('infinite', 'other-e', 'other-f')],
    ]);

    expectParity([], candidateEdge, new Map(), new Map());
    expectParity([{ x: 0, y: 0 }], candidateEdge, invalidPaths, edgesById);
    expectParity([{ x: 0, y: 0 }, { x: 30, y: 30 }], candidateEdge, invalidPaths, edgesById);
  });

  it('matches for orthogonal, non-orthogonal, strict, and endpoint-touching segments', () => {
    const candidateEdge = edge('candidate', 'source', 'target');
    const candidate = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const paths = new Map<string, readonly EndpointLanePoint[]>([
      ['strict', [{ x: 50, y: -20 }, { x: 50, y: 20 }]],
      ['touch-start', [{ x: 0, y: -20 }, { x: 0, y: 20 }]],
      ['touch-end', [{ x: 100, y: -20 }, { x: 100, y: 20 }]],
      ['touch-vertical-end', [{ x: 60, y: -20 }, { x: 60, y: 0 }]],
      ['diagonal', [{ x: 40, y: -20 }, { x: 60, y: 20 }]],
    ]);
    const edgesById = new Map([...paths.keys()].map(id => [id, edge(id, `${id}-source`, `${id}-target`)]));

    expectParity(candidate, candidateEdge, paths, edgesById);
    expect(createEndpointLaneInteractionContext(candidateEdge, paths, edgesById).evaluate(candidate))
      .toEqual({ crossings: 1, totalCrossings: 1, oppositeOverlap: 0 });
  });

  it('preserves related-edge crossing eligibility', () => {
    const candidateEdge = edge('candidate', 'shared-source', 'target', 'right');
    const candidate = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const crossingPath = [{ x: 50, y: -20 }, { x: 50, y: 20 }];
    const paths = new Map<string, readonly EndpointLanePoint[]>([
      ['same-source-with-handle', crossingPath],
      ['same-source-without-handle', crossingPath],
      ['same-target', crossingPath],
      ['unrelated', crossingPath],
    ]);
    const edgesById = new Map<string, Edge>([
      ['same-source-with-handle', edge('same-source-with-handle', 'shared-source', 'a', 'bottom')],
      ['same-source-without-handle', edge('same-source-without-handle', 'shared-source', 'b')],
      ['same-target', edge('same-target', 'other', 'target')],
      ['unrelated', edge('unrelated', 'other-c', 'other-d')],
    ]);

    expectParity(candidate, candidateEdge, paths, edgesById);
    expect(createEndpointLaneInteractionContext(candidateEdge, paths, edgesById).evaluate(candidate))
      .toEqual({ crossings: 2, totalCrossings: 4, oppositeOverlap: 0 });
  });

  it('preserves reverse-overlap exclusions and accumulation order', () => {
    const candidateEdge = edge('candidate', 'source', 'target');
    const candidate = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const paths = new Map<string, readonly EndpointLanePoint[]>([
      ['unrelated-reverse', [{ x: 80, y: 0 }, { x: 20, y: 0 }]],
      ['same-source-reverse', [{ x: 90, y: 0 }, { x: 10, y: 0 }]],
      ['same-target-reverse', [{ x: 70, y: 0 }, { x: 30, y: 0 }]],
      ['unrelated-forward', [{ x: 10, y: 0 }, { x: 90, y: 0 }]],
    ]);
    const edgesById = new Map<string, Edge>([
      ['unrelated-reverse', edge('unrelated-reverse', 'other-a', 'other-b')],
      ['same-source-reverse', edge('same-source-reverse', 'source', 'other-c')],
      ['same-target-reverse', edge('same-target-reverse', 'other-d', 'target')],
      ['unrelated-forward', edge('unrelated-forward', 'other-e', 'other-f')],
    ]);

    expectParity(candidate, candidateEdge, paths, edgesById);
    expect(createEndpointLaneInteractionContext(candidateEdge, paths, edgesById).evaluate(candidate).oppositeOverlap)
      .toBe(60);
  });

  it('matches the legacy scans at a large input boundary', () => {
    const candidateEdge = edge('candidate', 'source', 'target');
    const candidate = [{ x: 0, y: 0 }, { x: 1024, y: 0 }];
    const paths = new Map<string, readonly EndpointLanePoint[]>();
    const edgesById = new Map<string, Edge>();
    for (let index = 0; index < 256; index += 1) {
      const id = `edge-${index}`;
      paths.set(id, [{ x: index + 2, y: -10 }, { x: index + 2, y: 10 }]);
      edgesById.set(id, edge(id, `source-${index}`, `target-${index}`));
    }

    expectParity(candidate, candidateEdge, paths, edgesById);
    expect(createEndpointLaneInteractionContext(candidateEdge, paths, edgesById).evaluate(candidate))
      .toEqual({ crossings: 256, totalCrossings: 256, oppositeOverlap: 0 });
  });
});
