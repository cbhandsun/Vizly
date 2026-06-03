import { describe, expect, it } from 'vitest';
import {
  repairContainerHeaderSkimPath,
  repairDirectionalSourceExitPath,
  repairEndpointPortConstraintPath,
  repairTangentialEndpointEntryPath,
  type RoutingNodeRect,
} from '../containerHeaderSkimRepair';

const baseNodes: RoutingNodeRect[] = [
  { id: 'fix-quota', type: 'custom', x: 379.8, y: 2594, width: 252, height: 96 },
  { id: 'greedy-spec', type: 'custom', x: 82, y: 3094, width: 220, height: 96 },
  { id: 'titlegroup-resource', type: 'titleGroup', x: 0, y: 2948, width: 1037.77, height: 871 },
  { id: 'subgroup-direct', type: 'subGroup', x: 54, y: 3032, width: 309, height: 699 },
];

const firstSegment = (points: Array<{ x: number; y: number }>) => [points[0], points[1]] as const;
const lastSegment = (points: Array<{ x: number; y: number }>) => [points[points.length - 2], points[points.length - 1]] as const;

describe('repairContainerHeaderSkimPath', () => {
  it('lifts an entering edge off the target container header band', () => {
    const repaired = repairContainerHeaderSkimPath([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 3022 },
      { x: 192, y: 3022 },
      { x: 192, y: 3094 },
    ], {
      edgeId: 'e10',
      sourceId: 'fix-quota',
      targetId: 'greedy-spec',
      nodes: baseNodes,
    });

    expect(repaired).toEqual([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 2852 },
      { x: 192, y: 2852 },
      { x: 192, y: 3094 },
    ]);
  });

  it('keeps a path that is already clear of container headers', () => {
    const repaired = repairContainerHeaderSkimPath([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 2852 },
      { x: 192, y: 2852 },
      { x: 192, y: 3094 },
    ], {
      edgeId: 'e10',
      sourceId: 'fix-quota',
      targetId: 'greedy-spec',
      nodes: baseNodes,
    });

    expect(repaired).toBeNull();
  });

  it('does not move the corridor through a business obstacle', () => {
    const repaired = repairContainerHeaderSkimPath([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 3022 },
      { x: 192, y: 3022 },
      { x: 192, y: 3094 },
    ], {
      edgeId: 'e10',
      sourceId: 'fix-quota',
      targetId: 'greedy-spec',
      nodes: baseNodes,
      obstacles: [{ x: 300, y: 2830, width: 80, height: 70 }],
    });

    expect(repaired).toBeNull();
  });
});

describe('repairTangentialEndpointEntryPath', () => {
  it('adds a vertical target stub when a top port is entered tangentially', () => {
    const repaired = repairTangentialEndpointEntryPath([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 3094 },
      { x: 192, y: 3094 },
    ], {
      edgeId: 'e10',
      sourceId: 'fix-quota',
      targetId: 'greedy-spec',
      nodes: baseNodes,
    });

    expect(repaired).toEqual([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 2852 },
      { x: 192, y: 2852 },
      { x: 192, y: 3094 },
    ]);
  });

  it('keeps a target entry that is already perpendicular to the target side', () => {
    const repaired = repairTangentialEndpointEntryPath([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 2916 },
      { x: 192, y: 2916 },
      { x: 192, y: 3094 },
    ], {
      edgeId: 'e10',
      sourceId: 'fix-quota',
      targetId: 'greedy-spec',
      nodes: baseNodes,
    });

    expect(repaired).toBeNull();
  });
});

describe('repairEndpointPortConstraintPath', () => {
  it('moves a bottom-edge horizontal slide to a legal source-side exit', () => {
    const repaired = repairEndpointPortConstraintPath([
      { x: 589.625, y: 1266 },
      { x: 454.5, y: 1266 },
      { x: 446.5, y: 1546 },
      { x: 351, y: 1546 },
    ], {
      edgeId: 'e3',
      sourceId: 'calc-theory-ratio',
      targetId: 'sort-demand',
      nodes: [
        { id: 'calc-theory-ratio', type: 'custom', x: 466.624, y: 1170, width: 245.996, height: 95.996 },
        { id: 'sort-demand', type: 'custom', x: 146.499, y: 1498, width: 203.997, height: 95.996 },
      ],
    });

    expect(repaired).not.toBeNull();
    const [start, next] = firstSegment(repaired!);
    expect(start.x).toBeCloseTo(466.624);
    expect(next.x).toBeLessThan(start.x);
    const [prev, end] = lastSegment(repaired!);
    expect(end.x).toBeCloseTo(350.496);
    expect(prev.x).toBeGreaterThan(end.x);
  });

  it('repairs a source-legal path whose target still enters tangentially', () => {
    const repaired = repairEndpointPortConstraintPath([
      { x: 595.619, y: 1265.164 },
      { x: 595.619, y: 1490.833 },
      { x: 587.619, y: 1498.833 },
      { x: 254.499, y: 1498.833 },
    ], {
      edgeId: 'e3',
      sourceId: 'calc-theory-ratio',
      targetId: 'sort-demand',
      nodes: [
        { id: 'calc-theory-ratio', type: 'custom', x: 466.624, y: 1170, width: 245.996, height: 95.996 },
        { id: 'sort-demand', type: 'custom', x: 146.499, y: 1498, width: 203.997, height: 95.996 },
      ],
    });

    expect(repaired).not.toBeNull();
    const [start, next] = firstSegment(repaired!);
    expect(next.x).toBeCloseTo(start.x, 3);
    expect(next.y).toBeGreaterThan(start.y);
    const [prev, end] = lastSegment(repaired!);
    expect(end.x).toBeCloseTo(350.496);
    expect(prev.x).toBeGreaterThan(end.x);
    expect(prev.y).toBeCloseTo(end.y, 3);
  });

  it('moves a reverse left-side source exit to an outward side chosen from geometry', () => {
    const repaired = repairEndpointPortConstraintPath([
      { x: 677, y: 2058 },
      { x: 955, y: 2058 },
      { x: 963, y: 3142 },
      { x: 923, y: 3142 },
    ], {
      edgeId: 'e15',
      sourceId: 'pool-b-entry',
      targetId: 'merge-res',
      nodes: [
        { id: 'pool-b-entry', type: 'custom', x: 676.999, y: 2010, width: 215.996, height: 95.996 },
        { id: 'merge-res', type: 'custom', x: 711.499, y: 3094, width: 210.996, height: 95.996 },
      ],
    });

    expect(repaired).not.toBeNull();
    const [start, next] = firstSegment(repaired!);
    expect(start.y).toBeCloseTo(2105.996);
    expect(next.y).toBeGreaterThan(start.y);
    const [prev, end] = lastSegment(repaired!);
    expect(end.x).toBeCloseTo(922.495);
    expect(prev.x).toBeGreaterThan(end.x);
  });

  it('keeps an already legal source and target endpoint unchanged', () => {
    const repaired = repairEndpointPortConstraintPath([
      { x: 192, y: 3190 },
      { x: 192, y: 3350 },
    ], {
      edgeId: 'e11',
      sourceId: 'greedy-spec',
      targetId: 'check-rem',
      nodes: [
        { id: 'greedy-spec', type: 'custom', x: 82, y: 3094, width: 220, height: 96 },
        { id: 'check-rem', type: 'custom', x: 82, y: 3350, width: 220, height: 73 },
      ],
    });

    expect(repaired).toBeNull();
  });
});

describe('repairDirectionalSourceExitPath', () => {
  it('moves a far lateral cross-container edge out through the source side', () => {
    const repaired = repairDirectionalSourceExitPath([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 2852 },
      { x: 192, y: 2852 },
      { x: 192, y: 3094 },
    ], {
      edgeId: 'e10',
      sourceId: 'fix-quota',
      targetId: 'greedy-spec',
      nodes: baseNodes,
    });

    expect(repaired).toEqual([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 2762 },
      { x: 283.8, y: 2762 },
      { x: 283.8, y: 2852 },
      { x: 192, y: 2852 },
      { x: 192, y: 3094 },
    ]);
  });

  it('also moves a lower-left shared-source edge out through the source side', () => {
    const repaired = repairDirectionalSourceExitPath([
      { x: 1228, y: 390 },
      { x: 1228, y: 1250 },
      { x: 670, y: 1250 },
      { x: 670, y: 1478 },
    ], {
      edgeId: 'e16',
      sourceId: 'fix-quota',
      targetId: 'merge-res',
      nodes: [
        { id: 'fix-quota', type: 'custom', x: 1102, y: 294, width: 252, height: 96 },
        { id: 'merge-res', type: 'custom', x: 564, y: 1478, width: 211, height: 96 },
        { id: 'titlegroup-resource', type: 'titleGroup', x: 20, y: 1346, width: 1421, height: 761 },
        { id: 'subgroup-replenishment', type: 'subGroup', x: 541, y: 1418, width: 257, height: 657 },
      ],
    });

    expect(repaired).toEqual([
      { x: 1228, y: 390 },
      { x: 1228, y: 462 },
      { x: 1006, y: 462 },
      { x: 1006, y: 1250 },
      { x: 670, y: 1250 },
      { x: 670, y: 1478 },
    ]);
  });

  it('does not change a short mostly vertical edge', () => {
    const repaired = repairDirectionalSourceExitPath([
      { x: 505.8, y: 2690 },
      { x: 505.8, y: 3094 },
    ], {
      edgeId: 'e-local',
      sourceId: 'fix-quota',
      targetId: 'merge-res',
      nodes: [
        { id: 'fix-quota', type: 'custom', x: 379.8, y: 2594, width: 252, height: 96 },
        { id: 'merge-res', type: 'custom', x: 430, y: 3094, width: 220, height: 96 },
        { id: 'titlegroup-resource', type: 'titleGroup', x: 0, y: 2948, width: 1037.77, height: 871 },
      ],
    });

    expect(repaired).toBeNull();
  });
});
