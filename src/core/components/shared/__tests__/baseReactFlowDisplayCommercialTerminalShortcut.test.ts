import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildCommercialBranchedTerminalShortcutCandidates,
  buildCommercialParallelTerminalCorridorShortcutPaths,
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
    const candidates = buildCommercialParallelTerminalCorridorShortcutPaths([
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
