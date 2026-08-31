import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import {
  candidateStrictCrossingsForEdge,
  createDisplayCandidateInteractionContext,
  displaySegmentsForPath,
  getDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from '../baseReactFlowDisplayGeometry';
import { createDisplayStrictCrossingCounter } from '../baseReactFlowDisplayStrictCrossingCounter';
import * as crossingIndex from '../baseReactFlowDisplayStrictCrossingCounter';
import { repairInternalStrictCrossingLanes } from '../baseReactFlowDisplayStrictResidualRepair';
import {
  buildChangedTerminalCandidates,
  buildCrossedSpineInternalLaneCandidates,
  buildCrossedSpineLocalWallCandidates,
  buildDualTerminalOuterLaneCandidates,
  buildSingleTerminalOuterRingCandidates,
} from '../baseReactFlowDisplayCrossedSpineSkirtCandidates';

const vertical = (x: number, bottom = 10, top = -10): DisplaySegment => ({
  edgeIndex: 0, segmentIndex: 0, axis: 'v', direction: 1,
  a: { x, y: top }, b: { x, y: bottom },
});
const transpose = (segment: DisplaySegment): DisplaySegment => ({
  ...segment, axis: segment.axis === 'h' ? 'v' : 'h',
  a: { x: segment.a.y, y: segment.a.x }, b: { x: segment.b.y, y: segment.b.x },
});

describe('display candidate strict crossing index', () => {
  it('indexes the immutable blockers once for repeated candidate interaction scores', () => {
    const blockers = Array.from({ length: 2000 }, (_, index) => vertical(index * 20));
    const metrics = { candidateVisitCount: 0 };
    const originalFactory = crossingIndex.createDisplayStrictCrossingCounter;
    const factory = vi.spyOn(crossingIndex, 'createDisplayStrictCrossingCounter')
      .mockImplementation(segments => originalFactory(segments, metrics));
    try {
      const context = createDisplayCandidateInteractionContext(0, [], blockers);
      const path = [{ x: 19, y: 0 }, { x: 21, y: 0 }];
      for (let attempt = 0; attempt < 100; attempt += 1) {
        expect(context.evaluate(path)).toEqual({ strictCrossings: 1, unrelatedOverlap: 0 });
      }
      expect(factory).toHaveBeenCalledTimes(1);
      expect(metrics.candidateVisitCount).toBe(100);
    } finally { factory.mockRestore(); }
  });

  it('reuses blocker indexes across internal lane searches without changing the committed candidate', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: -100, y: -50 }, width: 100, height: 100, data: {} },
      { id: 'b', position: { x: 300, y: 250 }, width: 100, height: 100, data: {} },
      { id: 'c', position: { x: -100, y: 100 }, width: 100, height: 100, data: {} },
      { id: 'd', position: { x: 400, y: 350 }, width: 100, height: 100, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'ab', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', data: {
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }, { x: 300, y: 300 }],
      } },
      { id: 'cd', source: 'c', target: 'd', sourceHandle: 'right', targetHandle: 'left', data: {
        computedPath: [{ x: 0, y: 150 }, { x: 250, y: 150 }, { x: 250, y: 400 }, { x: 400, y: 400 }],
      } },
    ];
    const originalFactory = crossingIndex.createDisplayStrictCrossingCounter;
    const queries: number[] = [];
    const factory = vi.spyOn(crossingIndex, 'createDisplayStrictCrossingCounter').mockImplementation(segments => {
      const count = originalFactory(segments);
      const index = queries.length;
      queries.push(0);
      return path => {
        queries[index] += 1;
        expect(count(path)).toBe(candidateStrictCrossingsForEdge(0, [...path], [...segments]));
        return count(path);
      };
    });
    try {
      const before = structuredClone({ edges, nodes });
      const indexed = repairInternalStrictCrossingLanes(edges, nodes);
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.every(count => count > 1)).toBe(true);
      factory.mockImplementation(segments => path => candidateStrictCrossingsForEdge(0, [...path], [...segments]));
      expect(repairInternalStrictCrossingLanes(edges, nodes)).toEqual(indexed);
      expect({ edges, nodes }).toEqual(before);
    } finally { factory.mockRestore(); }
  });

  it.each([false, true])('matches the original scorer at exact tolerance boundaries, transposed=%s', transposed => {
    const original = [
      vertical(0.5), vertical(0.500001), vertical(9.5), vertical(9.499999),
      vertical(5, 0.5), vertical(5, 0.500001), vertical(5, 10, -0.5), vertical(5, 10, -0.500001),
      vertical(NaN), vertical(Infinity), vertical(3, Infinity, -Infinity),
    ];
    const blockers = transposed ? original.map(transpose) : original;
    const count = createDisplayStrictCrossingCounter(blockers);
    for (const path of [
      [], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 10, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0.5, y: 0 }],
      [{ x: 0, y: 0 }, { x: 10, y: 0.500001 }],
      [{ x: NaN, y: 0 }, { x: 10, y: 0 }],
      [{ x: -Infinity, y: 0 }, { x: Infinity, y: 0 }],
    ]) {
      const points = transposed ? path.map(point => ({ x: point.y, y: point.x })) : path;
      expect(count(points)).toBe(candidateStrictCrossingsForEdge(0, points, blockers));
    }
  });

  it('snapshots blockers and observes subsequent candidate edits without stale caches', () => {
    const blockers = [vertical(5)];
    const candidate = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const count = createDisplayStrictCrossingCounter(blockers);
    blockers[0].a.x = 100;
    blockers.length = 0;
    expect(count(candidate)).toBe(1);
    candidate[1].x = 4;
    expect(count(candidate)).toBe(0);
    expect(createDisplayStrictCrossingCounter([])(candidate)).toBe(0);
  });

  it('matches ordered full scans over seeded paths and duplicate/self blockers', () => {
    let state = 7231;
    const number = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return (state % 10000) / 10 - 500;
    };
    const blockers = Array.from({ length: 300 }, (_, index) => {
      const segment = vertical(number(), number(), number());
      return index % 2 ? segment : transpose(segment);
    });
    blockers.push(blockers[0], blockers[1]);
    const before = structuredClone(blockers);
    const count = createDisplayStrictCrossingCounter(blockers);
    for (let probe = 0; probe < 120; probe += 1) {
      const path: DisplayPoint[] = [{ x: number(), y: number() }];
      for (let index = 1; index < 8; index += 1) {
        const previous = path[index - 1];
        path.push(index % 2 ? { x: number(), y: previous.y } : { x: previous.x, y: number() });
      }
      expect(count(path)).toBe(candidateStrictCrossingsForEdge(99, path, blockers));
    }
    expect(blockers).toEqual(before);
  });

  it('visits only the crossing coordinate range in a large sparse graph', () => {
    const blockers = Array.from({ length: 10000 }, (_, index) => vertical(index * 10));
    const metrics = { candidateVisitCount: 0 };
    const path = [{ x: 19999, y: 0 }, { x: 20001, y: 0 }];
    const count = createDisplayStrictCrossingCounter(blockers, metrics);
    expect(count(path)).toBe(candidateStrictCrossingsForEdge(0, path, blockers));
    expect(metrics.candidateVisitCount).toBe(1);
  });

  it.each(['internal', 'wall', 'terminal', 'ring', 'dual'] as const)(
    'reuses one exact blocker index for the entire %s candidate family', family => {
      const path = [
        { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 400 },
        { x: 500, y: 400 }, { x: 500, y: 500 }, { x: 600, y: 500 },
      ];
      const edge: Edge = { id: 'route', source: 'a', target: 'b', sourceHandle: 'right',
        targetHandle: 'left', data: { computedPath: path } };
      const nodes: Node[] = [
        { id: 'a', position: { x: -100, y: -50 }, width: 100, height: 100, data: {} },
        { id: 'b', position: { x: 600, y: 450 }, width: 100, height: 100, data: {} },
        { id: 'obstacle', position: { x: 250, y: 100 }, width: 100, height: 100, data: {} },
      ];
      const blockers = [100, 200].flatMap((y, index) => displaySegmentsForPath([
        { x: 50, y }, { x: 200, y },
      ], index + 1));
      const spine = displaySegmentsForPath(path, 0)[1];
      const before = structuredClone({ edge, nodes, blockers });
      const originalFactory = crossingIndex.createDisplayStrictCrossingCounter;
      let evaluations = 0;
      const factory = vi.spyOn(crossingIndex, 'createDisplayStrictCrossingCounter')
        .mockImplementation((segments, metrics) => {
          const count = originalFactory(segments, metrics);
          return candidate => {
            evaluations += 1;
            const result = count(candidate);
            expect(result).toBe(candidateStrictCrossingsForEdge(0, [...candidate], [...segments]));
            return result;
          };
        });
      try {
        const build = () => family === 'internal' ? buildCrossedSpineInternalLaneCandidates(edge, 0, spine, nodes, blockers)
          : family === 'wall' ? buildCrossedSpineLocalWallCandidates(edge, 0, spine, nodes, blockers)
          : family === 'terminal' ? buildChangedTerminalCandidates(edge, 0, spine, nodes, blockers, 'target')
          : family === 'ring' ? buildSingleTerminalOuterRingCandidates(edge, 0, nodes, blockers, 'target')
          : buildDualTerminalOuterLaneCandidates(edge, 0, spine, nodes, blockers);
        const candidates = build();
        expect(candidates.length).toBeGreaterThan(1);
        for (const candidate of candidates) {
          expect(candidate.strictCrossings).toBe(candidateStrictCrossingsForEdge(
            candidate.edgeIndex, getDisplayComputedPath(candidate.edge), blockers,
          ));
        }
        expect({ edge, nodes, blockers }).toEqual(before);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(evaluations).toBeGreaterThanOrEqual(candidates.length);
        factory.mockImplementation(segments => candidate => (
          candidateStrictCrossingsForEdge(0, [...candidate], [...segments])
        ));
        expect(build()).toEqual(candidates);
      } finally {
        factory.mockRestore();
      }
    },
  );
});
