import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildCommercialBranchedTerminalShortcutCandidates,
  buildCommercialTerminalCorridorShortcutPaths,
  buildCommercialSameSideRectangularShortcutPaths,
  buildCommercialSourceTerminalShortcutCandidates,
  buildCommercialTerminalShortcutCandidates,
  buildLayoutFacingTerminalShortcutCandidates,
} from '../baseReactFlowDisplayCommercialTerminalShortcut';
import {
  displayPathLength,
  getDisplayComputedPath,
  segmentDisplayLength,
} from '../baseReactFlowDisplayGeometry';
import { MIN_RENDER_SAFE_ENDPOINT_STUB } from '../baseReactFlowDisplayEndpointStubRepair';
import { auditBaseReactFlowDisplayCommercialQuality } from '../baseReactFlowDisplayCommercialQuality';
import { scoreNodeClearanceRisk } from '../../../strategies/shared/edgeWaypointCandidateRepair';

const nodes: Node[] = [
  { id: 'source', position: { x: 400, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'target', position: { x: 0, y: 400 }, measured: { width: 100, height: 60 }, data: {} },
];

const edge = (data: Record<string, unknown> = {}): Edge => ({
  id: 'outer-route',
  source: 'source',
  target: 'target',
  sourceHandle: 'bottom',
  targetHandle: 'right',
  data: {
    computedPath: [
      { x: 450, y: 60 },
      { x: 450, y: 100 },
      { x: 700, y: 100 },
      { x: 700, y: -100 },
      { x: -100, y: -100 },
      { x: -100, y: 430 },
      { x: 100, y: 430 },
    ],
    ...data,
  },
});

const corridorNode = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id, position: { x, y }, measured: { width, height }, data: {},
});
const mixedCorridorNodes: Node[] = [
  corridorNode('source', -50, 1000, 100, 80),
  corridorNode('target', 416, -40, 100, 80),
  corridorNode('middle-blocker', 108, 500, 227, 96),
  corridorNode('target-blocker', 411, 200, 234, 96),
];
const mixedCorridorPath = [
  { x: 0, y: 1000 }, { x: 0, y: 900 }, { x: 360, y: 900 },
  { x: 360, y: 644 }, { x: 60, y: 644 }, { x: 60, y: 452 },
  { x: 360, y: 452 }, { x: 360, y: 0 }, { x: 416, y: 0 },
];
const mixedCorridorShortcut = [
  { x: 0, y: 1000 }, { x: 0, y: 900 }, { x: 384, y: 900 },
  { x: 384, y: 344 }, { x: 360, y: 344 }, { x: 360, y: 0 }, { x: 416, y: 0 },
];
const mixedCorridorEdge: Edge = {
  id: 'mixed-corridor', source: 'source', target: 'target', sourceHandle: 'top', targetHandle: 'left',
  data: { computedPath: mixedCorridorPath },
};
const rotateCorridorPoint = (point: { x: number; y: number }, turns: number): { x: number; y: number } => {
  let rotated = { ...point };
  for (let turn = 0; turn < turns; turn++) rotated = { x: -rotated.y, y: rotated.x };
  return rotated;
};
const rotateCorridorNode = (node: Node, turns: number): Node => {
  const width = Number(node.measured?.width);
  const height = Number(node.measured?.height);
  const start = rotateCorridorPoint(node.position, turns);
  const end = rotateCorridorPoint({ x: node.position.x + width, y: node.position.y + height }, turns);
  return { ...node, position: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) },
    measured: { width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) } };
};

describe('commercial terminal shortcuts', () => {
  it('switches both automatic sides for a materially shorter same-row route', () => {
    const sameRowNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      { id: 'target', position: { x: 310, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
    ];
    const baseline: Edge = {
      id: 'same-row-u',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: { computedPath: [
        { x: 100, y: 80 }, { x: 100, y: 180 },
        { x: 410, y: 180 }, { x: 410, y: 80 },
      ] },
    };

    const candidates = buildLayoutFacingTerminalShortcutCandidates(
      baseline,
      sameRowNodes,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
    });
    expect(getDisplayComputedPath(candidates[0])).toEqual([
      { x: 200, y: 40 },
      { x: 310, y: 40 },
    ]);
  });

  it('negotiates an un-compacted ELK U route before topology is locked', () => {
    const sameRowNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      { id: 'target', position: { x: 310, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
    ];
    const baseline: Edge = {
      id: 'same-row-elk-u',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: { computedPath: [
        { x: 100, y: 80 }, { x: 100, y: 120 },
        { x: 100, y: 180 }, { x: 255, y: 180 },
        { x: 410, y: 180 }, { x: 410, y: 80 },
      ] },
    };

    const [candidate] = buildLayoutFacingTerminalShortcutCandidates(
      baseline,
      sameRowNodes,
    );

    expect(candidate).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
    });
    expect(getDisplayComputedPath(candidate)).toEqual([
      { x: 200, y: 40 },
      { x: 310, y: 40 },
    ]);
  });

  it('replaces normalized mixed terminal sides when the facing corridor is materially shorter', () => {
    const mixedNodes: Node[] = [
      { id: 'source', position: { x: 2232, y: 479 }, measured: { width: 249, height: 96 }, data: {} },
      { id: 'target', position: { x: 2601, y: 695 }, measured: { width: 217, height: 96 }, data: {} },
    ];
    const baseline: Edge = {
      id: 'check-limit-pool-a',
      source: 'source',
      target: 'target',
      sourceHandle: 'left',
      targetHandle: 'bottom',
      data: { computedPath: [
        { x: 2232, y: 527 }, { x: 2184, y: 527 },
        { x: 2184, y: 839 }, { x: 2709.5, y: 839 },
        { x: 2709.5, y: 791 },
      ] },
    };

    const [candidate] = buildLayoutFacingTerminalShortcutCandidates(
      baseline,
      mixedNodes,
    );

    expect(candidate).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
    });
    expect(getDisplayComputedPath(candidate)).toEqual([
      { x: 2481, y: 527 },
      { x: 2541, y: 527 },
      { x: 2541, y: 743 },
      { x: 2601, y: 743 },
    ]);
  });

  it('does not switch authored sides or marginal same-side routes', () => {
    const sameRowNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target', position: { x: 1000, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
    ];
    const baseline: Edge = {
      id: 'same-row-u',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: { computedPath: [
        { x: 50, y: 60 }, { x: 50, y: 116 },
        { x: 1050, y: 116 }, { x: 1050, y: 60 },
      ] },
    };

    expect(buildLayoutFacingTerminalShortcutCandidates({
      ...baseline,
      data: { ...baseline.data, manualHandleSides: ['source'] },
    }, sameRowNodes)).toEqual([]);
    expect(buildLayoutFacingTerminalShortcutCandidates(
      baseline,
      sameRowNodes,
    )).toEqual([]);
  });

  it('shortens an outer corridor by landing on a nearer legal target side', () => {
    const baseline = edge();
    const candidates = buildCommercialTerminalShortcutCandidates(baseline, nodes);
    const leftCandidate = candidates.find(candidate => candidate.targetHandle === 'left');

    expect(leftCandidate).toBeDefined();
    expect(displayPathLength(getDisplayComputedPath(leftCandidate!)))
      .toBeLessThan(displayPathLength(getDisplayComputedPath(baseline)));
    const candidatePath = getDisplayComputedPath(leftCandidate!);
    expect(candidatePath.at(-1)).toEqual({ x: 0, y: 430 });
    expect(segmentDisplayLength(candidatePath.at(-2)!, candidatePath.at(-1)!))
      .toBeGreaterThanOrEqual(MIN_RENDER_SAFE_ENDPOINT_STUB);
  });

  it('does not switch a source-authored fixed target side', () => {
    const candidates = buildCommercialTerminalShortcutCandidates(edge({
      manualHandleSides: ['target'],
    }), nodes);

    expect(candidates.every(candidate => candidate.targetHandle === 'right')).toBe(true);
  });

  it('skips edges without enough finite route geometry', () => {
    expect(buildCommercialTerminalShortcutCandidates({
      ...edge(),
      data: { computedPath: [] },
    }, nodes)).toEqual([]);
  });

  it('can switch both terminals to shorten a same-column obstacle detour', () => {
    const sameColumnNodes: Node[] = [
      { id: 'source', position: { x: 100, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'blocker', position: { x: 100, y: 180 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target', position: { x: 100, y: 360 }, measured: { width: 100, height: 60 }, data: {} },
    ];
    const baseline: Edge = {
      id: 'same-column-detour',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 150, y: 60 },
          { x: 150, y: 100 },
          { x: 50, y: 100 },
          { x: 50, y: 320 },
          { x: 150, y: 320 },
          { x: 150, y: 360 },
        ],
      },
    };

    const candidates = buildCommercialSourceTerminalShortcutCandidates(
      baseline,
      sameColumnNodes,
    );
    const leftCandidate = candidates.find(candidate => candidate.sourceHandle === 'left');

    expect(leftCandidate).toBeDefined();
    expect(getDisplayComputedPath(leftCandidate!)[0]).toEqual({ x: 100, y: 30 });
    expect(getDisplayComputedPath(leftCandidate!).at(-1)).toEqual({ x: 150, y: 360 });
    expect(segmentDisplayLength(
      getDisplayComputedPath(leftCandidate!)[0],
      getDisplayComputedPath(leftCandidate!)[1],
    )).toBeGreaterThanOrEqual(MIN_RENDER_SAFE_ENDPOINT_STUB);
    expect(displayPathLength(getDisplayComputedPath(leftCandidate!)))
      .toBeLessThan(displayPathLength(getDisplayComputedPath(baseline)));
  });

  it('keeps a source-authored fixed source side in source-terminal candidates', () => {
    const candidates = buildCommercialSourceTerminalShortcutCandidates(edge({
      manualHandleSides: ['source'],
    }), nodes);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(candidate => candidate.sourceHandle === 'bottom')).toBe(true);
  });

  it('builds a source shortcut for a compact five-point outer route', () => {
    const baseline = edge({
      computedPath: [
        { x: 450, y: 60 },
        { x: 450, y: 100 },
        { x: 700, y: 100 },
        { x: 700, y: 430 },
        { x: 100, y: 430 },
      ],
    });

    const candidates = buildCommercialSourceTerminalShortcutCandidates(baseline, nodes);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(candidate => (
      displayPathLength(getDisplayComputedPath(candidate))
        < displayPathLength(getDisplayComputedPath(baseline))
    ))).toBe(true);
  });

  it('samples a blocker-clearance lane between the source stub and outer corridor', () => {
    const corridorNodes: Node[] = [
      { id: 'source', position: { x: 100, y: 420 }, measured: { width: 200, height: 100 }, data: {} },
      { id: 'blocker', position: { x: 100, y: 100 }, measured: { width: 200, height: 200 }, data: {} },
      { id: 'target', position: { x: 500, y: 0 }, measured: { width: 100, height: 100 }, data: {} },
    ];
    const baseline: Edge = {
      id: 'boundary-lane-shortcut',
      source: 'source',
      target: 'target',
      sourceHandle: 'left',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 100, y: 470 },
          { x: -100, y: 470 },
          { x: -100, y: 250 },
          { x: 550, y: 250 },
          { x: 550, y: 100 },
        ],
      },
    };

    const candidates = buildCommercialSourceTerminalShortcutCandidates(
      baseline,
      corridorNodes,
    );

    expect(candidates.some(candidate => {
      const candidatePath = getDisplayComputedPath(candidate);
      return candidate.sourceHandle === 'top'
        && candidatePath.filter(point => point.y === 348).length >= 2;
    })).toBe(true);
  });

  it('pulls a four-point same-side rectangle to render-safe endpoint stubs', () => {
    const rectangleNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target', position: { x: 400, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
    ];
    const baseline: Edge = {
      id: 'same-side-rectangle',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 50, y: 60 },
          { x: 50, y: 300 },
          { x: 450, y: 300 },
          { x: 450, y: 60 },
        ],
      },
    };

    const candidates = buildCommercialSameSideRectangularShortcutPaths(
      baseline,
      rectangleNodes,
    );

    expect(candidates[0]).toEqual([
      { x: 50, y: 60 },
      { x: 50, y: 116 },
      { x: 450, y: 116 },
      { x: 450, y: 60 },
    ]);
  });

  it('prefers an exact sibling trunk over a one-pixel pseudo lane', () => {
    const rectangleNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target', position: { x: 400, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'sibling-target', position: { x: 200, y: 300 }, measured: { width: 100, height: 60 }, data: {} },
    ];
    const baseline: Edge = {
      id: 'same-side-rectangle',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 50, y: 60 },
          { x: 50, y: 300 },
          { x: 450, y: 300 },
          { x: 450, y: 60 },
        ],
      },
    };
    const sibling: Edge = {
      id: 'sibling',
      source: 'source',
      target: 'sibling-target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 50, y: 60 },
          { x: 50, y: 117 },
          { x: 250, y: 117 },
          { x: 250, y: 300 },
        ],
      },
    };

    const candidates = buildCommercialSameSideRectangularShortcutPaths(
      baseline,
      rectangleNodes,
      [baseline, sibling],
    );

    expect(candidates[0]).toEqual([
      { x: 50, y: 60 },
      { x: 50, y: 117 },
      { x: 450, y: 117 },
      { x: 450, y: 60 },
    ]);
  });

  it('collapses a stepped clearance skirt onto its proven outer lane', () => {
    const candidates = buildCommercialTerminalCorridorShortcutPaths([
      { x: 217, y: 3213 },
      { x: 217, y: 3269 },
      { x: 98, y: 3269 },
      { x: 98, y: 3325 },
      { x: 66, y: 3325 },
      { x: 66, y: 3517 },
      { x: 98, y: 3517 },
      { x: 98, y: 3661 },
      { x: 204, y: 3661 },
      { x: 204, y: 3789 },
    ]);

    expect(candidates).toContainEqual([
      { x: 217, y: 3213 },
      { x: 217, y: 3269 },
      { x: 66, y: 3269 },
      { x: 66, y: 3661 },
      { x: 204, y: 3661 },
      { x: 204, y: 3789 },
    ]);
  });

  it.each([0, 1, 2, 3])('joins offset obstacle corridors with fixed mixed-axis terminals after %i quarter turns', turns => {
    const rotatedNodes = mixedCorridorNodes.map(node => rotateCorridorNode(node, turns));
    const path = mixedCorridorPath.map(point => rotateCorridorPoint(point, turns));
    const expected = mixedCorridorShortcut.map(point => rotateCorridorPoint(point, turns));
    const handles = ['top', 'right', 'bottom', 'left'];
    const baseline: Edge = { ...mixedCorridorEdge, sourceHandle: handles[turns], targetHandle: handles[(turns + 3) % 4],
      data: { computedPath: path, sourcePortPolicy: 'fixed-pos', targetPortPolicy: 'fixed-pos' } };
    const before = structuredClone({ baseline, rotatedNodes, path });
    const candidates = buildCommercialTerminalCorridorShortcutPaths(path, rotatedNodes, baseline);
    expect(path.length - 2).toBe(7);
    expect(candidates).toContainEqual(expected);
    expect(expected.length - 2).toBe(5);
    expect(displayPathLength(expected) - displayPathLength(path)).toBe(-552);
    expect(scoreNodeClearanceRisk(path, rotatedNodes, baseline, 48)).toBe(0);
    expect(candidates.length).toBeLessThanOrEqual(32);
    for (const candidate of candidates) {
      expect(candidate.slice(0, 2)).toEqual(path.slice(0, 2));
      expect(candidate.slice(-2)).toEqual(path.slice(-2));
      expect(candidate.every((point, index) => index === 0
        || point.x === candidate[index - 1].x || point.y === candidate[index - 1].y)).toBe(true);
      const candidateEdge = { ...baseline, data: { ...baseline.data, computedPath: candidate } };
      expect(scoreNodeClearanceRisk(candidate, rotatedNodes, candidateEdge, 48)).toBe(0);
      expect(auditBaseReactFlowDisplayCommercialQuality([candidateEdge])).toEqual([]);
    }
    expect(buildCommercialTerminalCorridorShortcutPaths(path, rotatedNodes.toReversed(), baseline)).toEqual(candidates);
    expect({ baseline, rotatedNodes, path }).toEqual(before);
  });

  it('ignores hidden and container geometry when sampling mixed-terminal corridors', () => {
    const baseline = buildCommercialTerminalCorridorShortcutPaths(mixedCorridorPath, mixedCorridorNodes, mixedCorridorEdge);
    const overlays: Node[] = [
      { ...corridorNode('hidden', -100, -100, 1000, 1200), hidden: true },
      ...['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'].map(type => ({
        ...corridorNode(type, -120, -120, 1040, 1240), type,
      })),
    ];
    expect(baseline.length).toBeGreaterThan(0);
    expect(buildCommercialTerminalCorridorShortcutPaths(mixedCorridorPath, [...mixedCorridorNodes, ...overlays], mixedCorridorEdge))
      .toEqual(baseline);
  });

  it('rejects empty, invalid, non-orthogonal and excessive mixed route geometry', () => {
    const invalidPaths = [
      [],
      ...[NaN, Infinity, -Infinity, 1_000_001, -1_000_001].map(x => mixedCorridorPath.map((point, index) => index === 2 ? { ...point, x } : point)),
      mixedCorridorPath.map((point, index) => index === 3 ? { x: point.x + 1, y: point.y } : point),
      [...Array.from({ length: 121 }, () => ({ ...mixedCorridorPath[0] })), ...mixedCorridorPath.slice(1)],
    ];
    for (const path of invalidPaths) {
      expect(buildCommercialTerminalCorridorShortcutPaths(path, mixedCorridorNodes, mixedCorridorEdge)).toEqual([]);
    }
    expect(buildCommercialTerminalCorridorShortcutPaths(mixedCorridorPath, mixedCorridorNodes)).toEqual([]);
    expect(buildCommercialTerminalCorridorShortcutPaths(mixedCorridorShortcut, mixedCorridorNodes, mixedCorridorEdge)).toEqual([]);
  });

  it('rejects excessive node count and invalid obstacle geometry', () => {
    const tooMany = Array.from({ length: 257 }, (_, index) => corridorNode(String(index), 108, 500, 227, 96));
    expect(buildCommercialTerminalCorridorShortcutPaths(mixedCorridorPath, tooMany, mixedCorridorEdge)).toEqual([]);
    for (const x of [NaN, Infinity, -Infinity, 1_000_001, -1_000_001]) {
      const invalidNodes = [...mixedCorridorNodes, corridorNode('invalid', x, 200, 100, 100)];
      expect(buildCommercialTerminalCorridorShortcutPaths(mixedCorridorPath, invalidNodes, mixedCorridorEdge)).toEqual([]);
    }
    for (const width of [NaN, Infinity, 0, -1]) {
      const invalidNodes = [...mixedCorridorNodes, corridorNode('invalid-size', 100, 200, width, 100)];
      expect(buildCommercialTerminalCorridorShortcutPaths(mixedCorridorPath, invalidNodes, mixedCorridorEdge)).toEqual([]);
    }
  });

  it('returns no mixed corridor when the source and target stubs leave no interior join interval', () => {
    const noJoinPath = [
      { x: 0, y: 1000 }, { x: 0, y: 900 }, { x: 360, y: 900 },
      { x: 360, y: 644 }, { x: 60, y: 644 }, { x: 60, y: 452 },
      { x: 360, y: 452 }, { x: 360, y: 900 }, { x: 416, y: 900 },
    ];
    expect(buildCommercialTerminalCorridorShortcutPaths(noJoinPath, [], mixedCorridorEdge)).toEqual([]);
    expect(buildCommercialTerminalCorridorShortcutPaths([], [], mixedCorridorEdge)).toEqual([]);
  });

  it('branches a facing-port shortcut after the source safety stub', () => {
    const facingEdge: Edge = {
      id: 'facing', source: 'source', target: 'target',
      sourceHandle: 'bottom', targetHandle: 'top',
      data: { computedPath: [
        { x: 1228, y: 1796 }, { x: 1228, y: 2828 },
        { x: 216, y: 2828 }, { x: 216, y: 2884 },
      ] },
    };

    expect(getDisplayComputedPath(buildCommercialBranchedTerminalShortcutCandidates(facingEdge)[0]))
      .toEqual([
        { x: 1228, y: 1796 }, { x: 1228, y: 1852 },
        { x: 1172, y: 1852 }, { x: 1172, y: 2772 },
        { x: 216, y: 2772 }, { x: 216, y: 2884 },
      ]);
  });

});
