import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  createDisplayTerminalValidationSnapshot,
  displayEdgesHaveNodeAttachedTerminals,
  displayEdgesHaveNodeAnchoredTerminals,
  displayTerminalValidationDoesNotRegress,
  getDisplayTerminalValidationReport,
  keepDisplayTerminalValidationNonRegressing,
  keepNodeAnchoredTerminalCandidates,
  repairTerminalHandleAxisCrossings,
} from '../baseReactFlowTerminalAxisRepair';
import {
  createTerminalAxisCoordinatePools,
  selectBoundedTerminalAxisCandidates,
  selectNearestTerminalAxisCoordinates,
  selectTerminalAxisOuterCoordinates,
} from '../baseReactFlowTerminalAxisCandidateSelection';
import { readTerminalEdgePath } from '../baseReactFlowTerminalGeometry';

const node = (
  id: string, x: number, y: number, width: number, height: number,
): Node & { positionAbsolute: { x: number; y: number } } => ({
  id,
  position: { x, y },
  positionAbsolute: { x, y },
  measured: { width, height },
  data: {},
});

const edge = (id: string, source: string, target: string, computedPath: Array<{ x: number; y: number }>): Edge => ({
  id,
  source,
  target,
  data: { computedPath },
});

describe('readTerminalEdgePath', () => {
  it('coerces finite coordinates and rejects malformed external path points', () => {
    const pathEdge = {
      id: 'boundary',
      source: 'a',
      target: 'b',
      data: {
        computedPath: [
          { x: '12.5', y: 4 },
          { x: 7, y: '-3' },
          null,
          'invalid',
          { x: '', y: 2 },
          { x: Number.NaN, y: 2 },
          { x: Number.POSITIVE_INFINITY, y: 2 },
          { x: '1e999', y: 2 },
          { x: {}, y: 2 },
        ],
      },
    } as unknown as Edge;

    expect(readTerminalEdgePath(pathEdge)).toEqual([
      { x: 12.5, y: 4 },
      { x: 7, y: -3 },
    ]);
    expect(readTerminalEdgePath({
      ...pathEdge,
      data: { computedPath: 'invalid', treeRouting: { points: [{ x: 1, y: 2 }] } },
    } as unknown as Edge)).toEqual([{ x: 1, y: 2 }]);
    expect(readTerminalEdgePath({ ...pathEdge, data: null } as unknown as Edge)).toEqual([]);
  });
});

describe('repairTerminalHandleAxisCrossings', () => {
  it('rebuilds a browser-measured top-to-bottom path instead of crossing adjacent terminal trunks', () => {
    const edges = [
      edge('customs', 'loms', 'customs-node', [
        { x: 1323, y: 803 }, { x: 1323, y: 898 }, { x: 2063, y: 898 }, { x: 2063, y: 981 },
      ]),
      edge('carrier', 'tms', 'carrier-node', [
        { x: 1288, y: 961 }, { x: 1288, y: 866 }, { x: 1546.25, y: 866 },
        { x: 1546.25, y: 585 }, { x: 1769, y: 585 }, { x: 1769, y: 278 },
      ]),
      edge('downstream', 'tms', 'downstream-node', [
        { x: 1374, y: 962 }, { x: 1470, y: 962 }, { x: 1470, y: 899 },
        { x: 2418, y: 899 }, { x: 2418, y: 239 },
      ]),
    ];
    const result = repairTerminalHandleAxisCrossings(edges, [
      node('loms', 1120.25, 605, 406, 197),
      node('customs-node', 1853.25, 981.5, 420, 197),
      node('tms', 1113.25, 962, 420, 236),
      node('carrier-node', 1608.49, 80, 322, 197),
      node('downstream-node', 2250.49, 119, 336, 119),
    ]);
    const paths = result.map(item => (item.data as any).computedPath as Array<{ x: number; y: number }>);
    expect(result.some(item => (item.data as any).terminalHandleAxisRepaired), JSON.stringify(paths)).toBe(true);
    for (const item of result.filter(candidate => (candidate.data as any).terminalHandleAxisRepaired)) {
      const path = (item.data as any).computedPath as Array<{ x: number; y: number }>;
      if (item.source === 'loms') {
        expect(path[1].y, JSON.stringify(paths)).toBeGreaterThanOrEqual(path[0].y + 48);
      } else {
        expect(path[1].y, JSON.stringify(paths)).toBeLessThanOrEqual(path[0].y - 48);
      }
    }
    expect(countStrictCrossings(paths), JSON.stringify(paths)).toBe(0);
    const quality = calculateEdgePathQualityScore(result);
    expect({
      strictCrossings: quality.strictCrossings,
      reverseOverlap: quality.reverseOverlap,
      unrelatedOverlap: quality.unrelatedOverlap,
      unexplainedRelatedOverlap: quality.unexplainedRelatedOverlap,
      tinyInteriorDoglegs: quality.tinyInteriorDoglegs,
      hairpins: quality.hairpins,
    }, JSON.stringify(paths)).toEqual({
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
    });
  });

  it('keeps large-graph outer-lane bounding quality-equivalent', () => {
    const measuredEdges = [
      edge('customs', 'loms', 'customs-node', [
        { x: 1323, y: 803 }, { x: 1323, y: 898 }, { x: 2063, y: 898 }, { x: 2063, y: 981 },
      ]),
      edge('carrier', 'tms', 'carrier-node', [
        { x: 1288, y: 961 }, { x: 1288, y: 866 }, { x: 1546.25, y: 866 },
        { x: 1546.25, y: 585 }, { x: 1769, y: 585 }, { x: 1769, y: 278 },
      ]),
      edge('downstream', 'tms', 'downstream-node', [
        { x: 1374, y: 962 }, { x: 1470, y: 962 }, { x: 1470, y: 899 },
        { x: 2418, y: 899 }, { x: 2418, y: 239 },
      ]),
    ];
    const fillerEdges = Array.from({ length: 22 }, (_, index) => edge(
      `filler-${index}`,
      `filler-source-${index}`,
      `filler-target-${index}`,
      [
        { x: 10_000, y: 10_000 + index * 100 },
        { x: 10_100, y: 10_000 + index * 100 },
      ],
    ));
    const fixtureNodes = [
      node('loms', 1120.25, 605, 406, 197),
      node('customs-node', 1853.25, 981.5, 420, 197),
      node('tms', 1113.25, 962, 420, 236),
      node('carrier-node', 1608.49, 80, 322, 197),
      node('downstream-node', 2250.49, 119, 336, 119),
    ];
    const unbounded = repairTerminalHandleAxisCrossings(measuredEdges, fixtureNodes);
    const result = repairTerminalHandleAxisCrossings(
      [...measuredEdges, ...fillerEdges],
      fixtureNodes,
    );
    const quality = calculateEdgePathQualityScore(result);
    const boundedCorePaths = result
      .slice(0, measuredEdges.length)
      .map(readTerminalEdgePath);
    const unboundedPaths = unbounded.map(readTerminalEdgePath);
    const totalLength = (paths: Array<Array<{ x: number; y: number }>>): number => paths
      .reduce((pathTotal, path) => pathTotal + path.slice(0, -1)
        .reduce((segmentTotal, point, index) => (
          segmentTotal
          + Math.abs(path[index + 1].x - point.x)
          + Math.abs(path[index + 1].y - point.y)
        ), 0), 0);

    expect(result.slice(0, measuredEdges.length).some(candidate => (
      candidate.data?.terminalHandleAxisRepaired === true
    ))).toBe(true);
    expect(totalLength(boundedCorePaths)).toBeLessThanOrEqual(
      totalLength(unboundedPaths) * 1.1,
    );
    expect(quality, JSON.stringify({
      bounded: boundedCorePaths,
      unbounded: unboundedPaths,
    })).toMatchObject({
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
    });
  });

  it('nudges an attached source port past adjacent terminal trunks without detaching it', () => {
    const edges = [
      edge('customs', 'loms', 'customs-node', [
        { x: 1323, y: 802 }, { x: 1323, y: 885 }, { x: 2063, y: 885 }, { x: 2063, y: 981 },
      ]),
      edge('loms-tms', 'loms', 'tms', [
        { x: 1323, y: 802 }, { x: 1323, y: 962 },
      ]),
      edge('carrier', 'tms', 'carrier-node', [
        { x: 1306, y: 962 }, { x: 1306, y: 865 }, { x: 1546.25, y: 865 },
        { x: 1546.25, y: 585 }, { x: 1769, y: 585 }, { x: 1769, y: 277 },
      ]),
    ];
    const nodes = [
      node('loms', 1120.25, 605, 406, 197),
      node('customs-node', 1853.25, 981.5, 420, 197),
      node('tms', 1113.25, 962, 420, 236),
      node('carrier-node', 1608.49, 80, 322, 197),
    ];

    const result = repairTerminalHandleAxisCrossings(edges, nodes);
    const paths = result.map(item => (item.data as any).computedPath as Array<{ x: number; y: number }>);
    const carrierPath = paths[2];

    expect(countStrictCrossings(paths), JSON.stringify(paths)).toBe(0);
    expect(displayEdgesHaveNodeAnchoredTerminals(result, nodes), JSON.stringify(paths)).toBe(true);
    expect(carrierPath[1].x).toBe(carrierPath[0].x);
  });

  it('rejects detached terminal candidates and wrong-axis fixed handles', () => {
    const baseline = edge('downstream', 'tms', 'downstream-node', [
      { x: 1374, y: 962 }, { x: 1374, y: 890 }, { x: 2418, y: 890 }, { x: 2418, y: 239 },
    ]);
    const detached = edge('downstream', 'tms', 'downstream-node', [
      { x: 2087, y: 962 }, { x: 2087, y: 890 }, { x: 2418, y: 890 }, { x: 2418, y: 239 },
    ]);
    const wrongAxis = {
      ...edge('downstream', 'tms', 'downstream-node', [
        { x: 1374, y: 962 }, { x: 1470, y: 962 }, { x: 1470, y: 890 },
        { x: 2418, y: 890 }, { x: 2418, y: 239 },
      ]),
      sourceHandle: 'top',
      data: {
        computedPath: [
          { x: 1374, y: 962 }, { x: 1470, y: 962 }, { x: 1470, y: 890 },
          { x: 2418, y: 890 }, { x: 2418, y: 239 },
        ],
        manualHandleSides: ['source'],
      },
    };
    const nodes = [
      node('tms', 1113.25, 962, 420, 236),
      node('downstream-node', 2250.49, 119, 336, 119),
    ];

    expect(keepNodeAnchoredTerminalCandidates([detached], [baseline], nodes)[0]).toBe(baseline);
    expect(keepNodeAnchoredTerminalCandidates([wrongAxis], [baseline], nodes)[0]).toBe(baseline);
    expect(keepNodeAnchoredTerminalCandidates([baseline], [detached], nodes)[0]).toBe(baseline);
  });

  it('uses the same 1.5px attachment tolerance as the rendered hard gate', () => {
    const nodes = [
      node('tms', 1113.25, 962, 420, 236),
      node('downstream-node', 2250.49, 119, 336, 119),
    ];
    const edgeWithSourceY = (sourceY: number) => edge('downstream', 'tms', 'downstream-node', [
      { x: 1374, y: sourceY }, { x: 1374, y: 890 },
      { x: 2418, y: 890 }, { x: 2418, y: 238 },
    ]);

    expect(displayEdgesHaveNodeAttachedTerminals([edgeWithSourceY(960.5)], nodes)).toBe(true);
    expect(displayEdgesHaveNodeAttachedTerminals([edgeWithSourceY(960)], nodes)).toBe(false);
  });

  it('bulk-validates mixed terminal states with the same semantics as the legacy gates', () => {
    const nodes = [
      node('source', 0, 0, 100, 60),
      node('target', 200, 200, 100, 60),
    ];
    const anchored = edge('anchored', 'source', 'target', [
      { x: 50, y: 60 }, { x: 50, y: 120 }, { x: 250, y: 120 }, { x: 250, y: 200 },
    ]);
    const wrongFixedAxisPath = [
      { x: 50, y: 60 }, { x: 110, y: 60 }, { x: 110, y: 120 },
      { x: 250, y: 120 }, { x: 250, y: 200 },
    ];
    const wrongFixedAxis = {
      ...edge('wrong-fixed-axis', 'source', 'target', wrongFixedAxisPath),
      sourceHandle: 'bottom',
      data: {
        computedPath: wrongFixedAxisPath,
        manualHandleSides: ['source'],
      },
    };
    const detached = edge('detached', 'source', 'target', [
      { x: 150, y: 60 }, { x: 150, y: 120 }, { x: 250, y: 120 }, { x: 250, y: 200 },
    ]);
    const snapshot = createDisplayTerminalValidationSnapshot(nodes);

    expect(getDisplayTerminalValidationReport([], snapshot)).toEqual({
      allAttached: true,
      allAnchored: true,
      unanchoredEdgeIndexes: [],
    });
    expect(getDisplayTerminalValidationReport([anchored], snapshot)).toEqual({
      allAttached: true,
      allAnchored: true,
      unanchoredEdgeIndexes: [],
    });
    expect(getDisplayTerminalValidationReport(
      [anchored, wrongFixedAxis, detached],
      snapshot,
    )).toEqual({
      allAttached: false,
      allAnchored: false,
      unanchoredEdgeIndexes: [1, 2],
    });
    expect(displayEdgesHaveNodeAttachedTerminals([anchored, wrongFixedAxis], nodes)).toBe(true);
    expect(displayEdgesHaveNodeAnchoredTerminals([anchored, wrongFixedAxis], nodes)).toBe(false);
    expect(displayEdgesHaveNodeAttachedTerminals([anchored, wrongFixedAxis, detached], nodes)).toBe(false);
  });

  it('rejects a candidate that trades one clean terminal role for another edge improvement', () => {
    const nodes = [
      node('source-a', 0, 0, 100, 60),
      node('target-a', 0, 200, 100, 60),
      node('source-b', 200, 0, 100, 60),
      node('target-b', 200, 200, 100, 60),
    ];
    const cleanA = edge('a', 'source-a', 'target-a', [
      { x: 50, y: 60 }, { x: 50, y: 200 },
    ]);
    const detachedB = edge('b', 'source-b', 'target-b', [
      { x: 350, y: 60 }, { x: 250, y: 200 },
    ]);
    const detachedA = edge('a', 'source-a', 'target-a', [
      { x: 150, y: 60 }, { x: 50, y: 200 },
    ]);
    const cleanB = edge('b', 'source-b', 'target-b', [
      { x: 250, y: 60 }, { x: 250, y: 200 },
    ]);
    const snapshot = createDisplayTerminalValidationSnapshot(nodes);

    expect(displayTerminalValidationDoesNotRegress(
      [cleanA, detachedB],
      [detachedA, cleanB],
      snapshot,
    )).toBe(false);
    expect(displayTerminalValidationDoesNotRegress(
      [cleanA, detachedB],
      [cleanA, cleanB],
      snapshot,
    )).toBe(true);
    expect(keepDisplayTerminalValidationNonRegressing(
      [cleanA, detachedB],
      [detachedA, cleanB],
      snapshot,
    )).toEqual([cleanA, cleanB]);
  });

  it('accepts only bounded renderer fillet transitions after a boundary trunk', () => {
    const nodes = [
      node('source', 0, 0, 100, 60),
      node('target', 300, 0, 100, 60),
    ];
    const renderedFillet = {
      ...edge('rendered-fillet', 'source', 'target', [
        { x: 100, y: 30 }, { x: 100, y: -40 }, { x: 108, y: -48 },
        { x: 220, y: -48 }, { x: 228, y: -40 }, { x: 228, y: 30 },
        { x: 240, y: 30 }, { x: 300, y: 30 },
      ]),
      sourceHandle: 'right',
      targetHandle: 'left',
    };
    const oversizedTransition = {
      ...renderedFillet,
      data: {
        computedPath: [
          { x: 100, y: 30 }, { x: 100, y: -40 }, { x: 132, y: -72 },
          { x: 220, y: -72 }, { x: 228, y: -40 }, { x: 228, y: 30 },
          { x: 240, y: 30 }, { x: 300, y: 30 },
        ],
      },
    };
    const dualFilletShortStub = {
      ...edge('dual-fillet-short-stub', 'source', 'target', [
        { x: 100, y: 30 }, { x: 160, y: 30 }, { x: 160, y: -18 },
        { x: 250, y: -18 }, { x: 258, y: -26 }, { x: 292, y: -26 },
        { x: 300, y: -18 }, { x: 300, y: 30 },
      ]),
      sourceHandle: 'right',
      targetHandle: 'left',
    };

    expect(displayEdgesHaveNodeAnchoredTerminals([renderedFillet], nodes)).toBe(false);
    expect(displayEdgesHaveNodeAnchoredTerminals([renderedFillet], nodes, {
      allowRenderedFilletTransitions: true,
    })).toBe(true);
    expect(displayEdgesHaveNodeAnchoredTerminals([oversizedTransition], nodes, {
      allowRenderedFilletTransitions: true,
    })).toBe(false);
    expect(displayEdgesHaveNodeAnchoredTerminals([dualFilletShortStub], nodes)).toBe(false);
    expect(displayEdgesHaveNodeAnchoredTerminals([dualFilletShortStub], nodes, {
      allowRenderedFilletTransitions: true,
    })).toBe(true);
  });

  it('does not treat renderer runtime handle locks as fixed semantic port constraints', () => {
    const runtimeLocked = {
      ...edge('runtime-locked', 'source', 'target', [
        { x: 50, y: 60 }, { x: 50, y: 120 }, { x: 320, y: 120 },
        { x: 320, y: 200 }, { x: 250, y: 200 },
      ]),
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 50, y: 60 }, { x: 50, y: 120 }, { x: 320, y: 120 },
          { x: 320, y: 200 }, { x: 250, y: 200 },
        ],
        runtimeHandleLock: { source: true, target: true },
      },
    };

    expect(displayEdgesHaveNodeAnchoredTerminals([runtimeLocked], [
      node('source', 0, 0, 100, 60),
      node('target', 200, 200, 100, 60),
    ])).toBe(true);
  });

  it('separates unrelated BMS and YMS flows that share a middle lane', () => {
    const edges = [
      edge('wms-bms', 'wms', 'bms', [
        { x: 318, y: 628 }, { x: 318, y: 591 }, { x: 645, y: 591 },
        { x: 645, y: 345 }, { x: 972, y: 345 }, { x: 972, y: 311 },
      ]),
      edge('tms-yms', 'tms', 'yms', [
        { x: 318, y: 486 }, { x: 318, y: 520 }, { x: 645, y: 520 },
        { x: 645, y: 563 }, { x: 800, y: 563 },
      ]),
    ];
    const nodes = [
      node('tms', 132, 278, 371, 208),
      node('wms', 132, 628, 371, 208),
      node('bms', 805, 137, 334, 174),
      node('yms', 800, 479, 344, 173),
    ];

    const baselineQuality = calculateEdgePathQualityScore(edges);
    expect(baselineQuality.reverseOverlap).toBeGreaterThan(0);
    expect(baselineQuality.unrelatedOverlap).toBeGreaterThan(0);

    const result = repairTerminalHandleAxisCrossings(edges, nodes);
    const quality = calculateEdgePathQualityScore(result);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.reverseOverlap).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
  });

  it('nudges a short TMS source stub away from an unrelated visibility trunk', () => {
    const edges = [
      edge('loms-visibility', 'loms', 'visibility', [
        { x: 1323, y: 803 }, { x: 1323, y: 851 }, { x: 1093.25, y: 851 },
        { x: 1093.25, y: 1218 }, { x: 1323, y: 1218 }, { x: 1323, y: 1825 },
        { x: 1790, y: 1825 }, { x: 1790, y: 1921 },
      ]),
      edge('tms-bms', 'tms', 'bms', [
        { x: 1323, y: 1199 }, { x: 1323, y: 1247 },
        { x: 1024, y: 1247 }, { x: 1024, y: 1377 },
      ]),
    ];
    const nodes = [
      node('loms', 1120.25, 605, 406, 197),
      node('tms', 1113.25, 962, 420, 236),
      node('bms', 772, 1377.5, 378, 197),
      node('visibility', 1579.69, 1922, 420, 236),
    ];

    expect(calculateEdgePathQualityScore(edges).unrelatedOverlap).toBe(29);

    const result = repairTerminalHandleAxisCrossings(edges, nodes);
    const quality = calculateEdgePathQualityScore(result);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(result.some(candidate => (candidate.data as any).terminalHandleAxisRepaired)).toBe(true);
  });
});

const countStrictCrossings = (paths: Array<Array<{ x: number; y: number }>>): number => {
  let count = 0;
  for (let first = 0; first < paths.length; first += 1) {
    for (let second = first + 1; second < paths.length; second += 1) {
      for (let i = 0; i < paths[first].length - 1; i += 1) {
        for (let j = 0; j < paths[second].length - 1; j += 1) {
          const a = [paths[first][i], paths[first][i + 1]];
          const b = [paths[second][j], paths[second][j + 1]];
          const aHorizontal = Math.abs(a[0].y - a[1].y) <= 0.5;
          const bHorizontal = Math.abs(b[0].y - b[1].y) <= 0.5;
          if (aHorizontal === bHorizontal) continue;
          const horizontal = aHorizontal ? a : b;
          const vertical = aHorizontal ? b : a;
          if (
            vertical[0].x > Math.min(horizontal[0].x, horizontal[1].x) + 1
            && vertical[0].x < Math.max(horizontal[0].x, horizontal[1].x) - 1
            && horizontal[0].y > Math.min(vertical[0].y, vertical[1].y) + 1
            && horizontal[0].y < Math.max(vertical[0].y, vertical[1].y) - 1
          ) count += 1;
        }
      }
    }
  }
  return count;
};

const identityCandidatePath = <Point extends { x: number; y: number }>(path: Point[]): Point[] => path;

describe('selectBoundedTerminalAxisCandidates', () => {
  it('creates coordinate pools from path points and obstacle boundaries', () => {
    expect(createTerminalAxisCoordinatePools(
      [[{ x: 10, y: 20 }]],
      new Map([['obstacle', { x: 100, y: 200, width: 30, height: 40 }]]),
      4,
      8,
    )).toEqual({
      x: [10, 6, 14, 2, 18, 100, 96, 104, 92, 108, 130, 126, 134, 122, 138],
      y: [20, 16, 24, 12, 28, 200, 196, 204, 192, 208, 240, 236, 244, 232, 248],
    });
    expect(createTerminalAxisCoordinatePools([], new Map(), 4, 8)).toEqual({ x: [], y: [] });
  });

  it('ranks by raw Manhattan length before applying the candidate limit', () => {
    const long = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const short = [{ x: 0, y: 0 }, { x: 2, y: 0 }];

    expect(selectBoundedTerminalAxisCandidates([
      { path: long, minimumPointCount: 0 },
      { path: short, minimumPointCount: 0 },
    ], identityCandidatePath, 1)).toEqual([short]);
  });

  it('filters undersized and duplicate compacted paths before consuming the limit', () => {
    const duplicateA = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const duplicateB = [{ x: 0, y: 0 }, { x: 2, y: 0 }];
    const valid = [{ x: 0, y: 0 }, { x: 0, y: 3 }];
    const compact = (path: Array<{ x: number; y: number }>) => path === duplicateA ? duplicateB : path;

    expect(selectBoundedTerminalAxisCandidates([
      { path: [{ x: 0, y: 0 }], minimumPointCount: 2 },
      { path: duplicateA, minimumPointCount: 2 },
      { path: duplicateB, minimumPointCount: 2 },
      { path: valid, minimumPointCount: 2 },
    ], compact, 2)).toEqual([duplicateB, valid]);
  });

  it('returns no candidates for an empty or non-positive limit', () => {
    expect(selectBoundedTerminalAxisCandidates([], identityCandidatePath, 4)).toEqual([]);
    expect(selectBoundedTerminalAxisCandidates([
      { path: [{ x: 0, y: 0 }, { x: 1, y: 0 }], minimumPointCount: 0 },
    ], identityCandidatePath, 0)).toEqual([]);
  });

  it('normalizes nearest coordinates and bounds large outer products with extremes', () => {
    expect(selectNearestTerminalAxisCoordinates(
      [Number.NaN, 10.004, 10.003, 30, 20],
      18,
      2,
    )).toEqual([20, 10]);
    expect(selectTerminalAxisOuterCoordinates({
      targetValues: [0, 10, 20, 30, 40],
      trunkValues: [100, 110, 120, 130, 140],
      targetPreferred: 21,
      trunkPreferred: 119,
      boundProduct: true,
      maximumCandidateCount: 4,
      targetNearestLimit: 2,
      trunkNearestLimit: 2,
    })).toEqual({
      targetLanes: [20, 30, 0, 40],
      trunks: [120, 110, 100, 140],
    });
  });

  it('retains complete small products and handles empty coordinate pools', () => {
    expect(selectTerminalAxisOuterCoordinates({
      targetValues: [0, 10],
      trunkValues: [100, 110],
      targetPreferred: 0,
      trunkPreferred: 100,
      boundProduct: true,
      maximumCandidateCount: 4,
      targetNearestLimit: 1,
      trunkNearestLimit: 1,
    })).toEqual({ targetLanes: [0, 10], trunks: [100, 110] });
    expect(selectTerminalAxisOuterCoordinates({
      targetValues: [],
      trunkValues: [],
      targetPreferred: 0,
      trunkPreferred: 0,
      boundProduct: true,
      maximumCandidateCount: 0,
      targetNearestLimit: 0,
      trunkNearestLimit: 0,
    })).toEqual({ targetLanes: [], trunks: [] });
  });
});
