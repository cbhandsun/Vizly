// @vitest-environment node
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { measureRoutedLayoutQuality, routedLayoutDominates,
  routedLayoutImprovesReadableFlow } from './routedLayoutQuality';

const nodes: Node[] = [
  { id: 'a', data: {}, position: { x: 0, y: 0 }, width: 40, height: 40 },
  { id: 'b', data: {}, position: { x: 160, y: 120 }, width: 40, height: 40 },
];
const edge = (id: string, path: { x: number; y: number }[], source = 'a', target = 'b'): Edge => ({
  id, source, target, data: { computedPath: path },
});
const straight = edge('one', [{ x: 0, y: 60 }, { x: 200, y: 60 }]);
const vertical = edge('two', [{ x: 100, y: 0 }, { x: 100, y: 160 }]);

describe('routed layout candidate quality', () => {
  it('measures actual route crossings and detours with identical node positions', () => {
    const crossed = measureRoutedLayoutQuality(nodes, [straight, vertical]);
    const detour = edge('two', [{ x: 100, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 160 }, { x: 100, y: 160 }]);
    const routed = measureRoutedLayoutQuality(nodes, [straight, detour]);
    expect(crossed).toMatchObject({ width: 200, height: 160, crossings: 1, sharedLaneOverlap: 0, flowOrthogonalDrift: 320, pathLength: 360, bends: 0 });
    expect(routed).toMatchObject({ width: 220, crossings: 0, sharedLaneOverlap: 0, flowOrthogonalDrift: 320, pathLength: 600, bends: 2 });
    expect(routedLayoutDominates(crossed, routed)).toBe(false);
  });
  it('accepts shorter routed paths without widening the graph or adding crossings', () => {
    const baseline = {
      width: 200,
      height: 160,
      crossings: 1,
      sharedLaneOverlap: 0,
      hemisphereSharedLaneOverlap: 0,
      flowOrthogonalDrift: 0,
      orthogonalRouteTravel: 0,
      pathLength: 600,
      bends: 2,
      backwardTravel: 0,
      labelLabelOverlap: 0,
      labelNodeOverlap: 0,
    };
    const candidate = { ...baseline, height: 120, pathLength: 400, crossings: 0 };
    expect(routedLayoutDominates(baseline, candidate)).toBe(true);
    expect(routedLayoutDominates(candidate, candidate)).toBe(false);
    for (const key of [
      'width',
      'height',
      'crossings',
      'sharedLaneOverlap',
      'hemisphereSharedLaneOverlap',
      'flowOrthogonalDrift',
      'orthogonalRouteTravel',
      'pathLength',
      'bends',
      'backwardTravel',
      'labelLabelOverlap',
      'labelNodeOverlap',
    ] as const) {
      expect(routedLayoutDominates(baseline, { ...candidate, [key]: baseline[key] + 1 })).toBe(false);
    }
  });
  it('prefers fewer non-protected shared lanes when other route dimensions tie', () => {
    const overlapped = [
      edge('one', [{ x: 0, y: 40 }, { x: 160, y: 40 }]),
      edge('two', [{ x: 40, y: 40 }, { x: 200, y: 40 }]),
    ];
    const separated = [
      edge('one', [{ x: 0, y: 40 }, { x: 160, y: 40 }]),
      edge('two', [{ x: 40, y: 80 }, { x: 200, y: 80 }]),
    ];

    const baseline = measureRoutedLayoutQuality(nodes, overlapped);
    const candidate = measureRoutedLayoutQuality(nodes, separated);

    expect(baseline).toMatchObject({ sharedLaneOverlap: 3, flowOrthogonalDrift: 320, pathLength: 320, bends: 0, crossings: 0 });
    expect(candidate).toMatchObject({ sharedLaneOverlap: 0, pathLength: 320, bends: 0, crossings: 0 });
    expect(routedLayoutDominates(baseline, candidate)).toBe(true);
    expect(routedLayoutDominates(candidate, baseline)).toBe(false);
  });

  it('measures estimated edge label collisions before choosing a routed candidate', () => {
    const labelNodes: Node[] = [
      { id: 'a', data: {}, position: { x: 0, y: 220 }, width: 40, height: 40 },
      { id: 'b', data: {}, position: { x: 260, y: 220 }, width: 40, height: 40 },
    ];
    const labelledOverlap = [
      edge('alpha', [{ x: 60, y: 40 }, { x: 220, y: 40 }]),
      edge('beta', [{ x: 64, y: 42 }, { x: 224, y: 42 }]),
    ].map(route => ({ ...route, data: { ...route.data, label: `Label ${route.id}` } }));
    const labelledSeparated = [
      edge('alpha', [{ x: 60, y: 40 }, { x: 220, y: 40 }]),
      edge('beta', [{ x: 64, y: 100 }, { x: 224, y: 100 }]),
    ].map(route => ({ ...route, data: { ...route.data, label: `Label ${route.id}` } }));

    const crowded = measureRoutedLayoutQuality(labelNodes, labelledOverlap);
    const separated = measureRoutedLayoutQuality(labelNodes, labelledSeparated);

    expect(crowded).toMatchObject({ labelLabelOverlap: 1, labelNodeOverlap: 0 });
    expect(separated).toMatchObject({ labelLabelOverlap: 0, labelNodeOverlap: 0 });
    expect(routedLayoutDominates(crowded, separated)).toBe(true);
    expect(routedLayoutImprovesReadableFlow(crowded, { ...separated!,
      hemisphereSharedLaneOverlap: crowded!.hemisphereSharedLaneOverlap - 1, labelLabelOverlap: 1,
    })).toBe(false);
  });

  it('measures estimated edge label collisions with business nodes', () => {
    const labelled = edge('labelled', [{ x: 0, y: 20 }, { x: 160, y: 20 }]);
    const quality = measureRoutedLayoutQuality(nodes, [{ ...labelled, data: { ...labelled.data, label: 'Covers source node' } }]);

    expect(quality).toMatchObject({ labelNodeOverlap: 1 });
  });
  it('prefers clearer readable flow only without route or geometry regressions', () => {
    const baseline = {
      width: 200,
      height: 160,
      crossings: 0,
      sharedLaneOverlap: 0,
      hemisphereSharedLaneOverlap: 80,
      flowOrthogonalDrift: 0,
      orthogonalRouteTravel: 0,
      pathLength: 400,
      bends: 2,
      backwardTravel: 0,
      labelLabelOverlap: 0,
      labelNodeOverlap: 0,
    };
    const clearer = { ...baseline, hemisphereSharedLaneOverlap: 0 };
    expect(routedLayoutImprovesReadableFlow(baseline, clearer)).toBe(true);
    expect(routedLayoutImprovesReadableFlow(baseline, { ...clearer, bends: baseline.bends + 1 })).toBe(false);
    expect(routedLayoutImprovesReadableFlow(baseline, { ...clearer, pathLength: baseline.pathLength + 1 })).toBe(false);
    expect(routedLayoutImprovesReadableFlow(baseline, baseline)).toBe(false);
    expect(routedLayoutImprovesReadableFlow(null, clearer)).toBe(false);
  });

  it('measures cross-flow drift independently from route length', () => {
    const driftNodes: Node[] = [
      { id: 'a', data: {}, position: { x: 0, y: 0 }, width: 40, height: 40 },
      { id: 'b', data: {}, position: { x: 120, y: 80 }, width: 40, height: 40 },
      { id: 'c', data: {}, position: { x: 120, y: 0 }, width: 40, height: 40 },
    ];
    const sameLength = [
      edge('drift', [{ x: 20, y: 20 }, { x: 140, y: 20 }], 'a', 'b'),
      edge('aligned', [{ x: 20, y: 20 }, { x: 140, y: 20 }], 'a', 'c'),
    ];
    expect(measureRoutedLayoutQuality(driftNodes.slice(0, 2), [sameLength[0]], 'LR'))
      .toMatchObject({ flowOrthogonalDrift: 80, pathLength: 120 });
    expect(measureRoutedLayoutQuality([driftNodes[0], driftNodes[2]], [sameLength[1]], 'LR'))
      .toMatchObject({ flowOrthogonalDrift: 0, pathLength: 120 });
  });

  it('measures same-endpoint shared lanes across opposite node hemispheres', () => {
    const hemisphereNodes: Node[] = [
      { id: 'hub', data: {}, position: { x: 100, y: 100 }, width: 40, height: 40 },
      { id: 'left', data: {}, position: { x: 0, y: 100 }, width: 40, height: 40 },
      { id: 'right', data: {}, position: { x: 220, y: 100 }, width: 40, height: 40 },
      { id: 'right-2', data: {}, position: { x: 220, y: 180 }, width: 40, height: 40 },
    ];
    const sharedOpposite: Edge[] = [
      { id: 'left', source: 'hub', target: 'left', data: { computedPath: [
        { x: 120, y: 120 }, { x: 120, y: 180 }, { x: 20, y: 180 },
      ] } },
      { id: 'right', source: 'hub', target: 'right', data: { computedPath: [
        { x: 120, y: 120 }, { x: 120, y: 180 }, { x: 240, y: 180 },
      ] } },
    ];
    const sharedSame: Edge[] = [
      sharedOpposite[1],
      { id: 'right-2', source: 'hub', target: 'right-2', data: { computedPath: [
        { x: 120, y: 120 }, { x: 120, y: 180 }, { x: 240, y: 180 }, { x: 240, y: 200 },
      ] } },
    ];

    expect(measureRoutedLayoutQuality(hemisphereNodes, sharedOpposite))
      .toMatchObject({ hemisphereSharedLaneOverlap: 60 });
    expect(measureRoutedLayoutQuality(hemisphereNodes, sharedSame))
      .toMatchObject({ hemisphereSharedLaneOverlap: 0 });
  });

  it('classifies hemisphere shared lanes relative to the layout flow axis', () => {
    const directionalNodes: Node[] = [
      { id: 'hub', data: {}, position: { x: 100, y: 100 }, width: 40, height: 40 },
      { id: 'upper-right', data: {}, position: { x: 160, y: 30 }, width: 40, height: 40 },
      { id: 'lower-right', data: {}, position: { x: 160, y: 170 }, width: 40, height: 40 },
    ];
    const shared: Edge[] = [
      { id: 'upper-right', source: 'hub', target: 'upper-right', data: { computedPath: [
        { x: 120, y: 120 }, { x: 120, y: 180 }, { x: 180, y: 180 }, { x: 180, y: 50 },
      ] } },
      { id: 'lower-right', source: 'hub', target: 'lower-right', data: { computedPath: [
        { x: 120, y: 120 }, { x: 120, y: 180 }, { x: 180, y: 180 }, { x: 180, y: 190 },
      ] } },
    ];

    expect(measureRoutedLayoutQuality(directionalNodes, shared, 'TB'))
      .toMatchObject({ hemisphereSharedLaneOverlap: 120 });
    expect(measureRoutedLayoutQuality(directionalNodes, shared, 'LR'))
      .toMatchObject({ hemisphereSharedLaneOverlap: 0 });
  });
  it.each(['TB', 'BT', 'LR', 'RL'] as const)('measures backward travel consistently in %s', direction => {
    const path = [{ x: 60, y: 0 }, { x: 60, y: 100 }, { x: 100, y: 100 },
      { x: 100, y: 70 }, { x: 140, y: 70 }, { x: 140, y: 160 }];
    const transformed = path.map(({ x, y }) => direction === 'LR' ? { x: y, y: x }
      : direction === 'RL' ? { x: 160 - y, y: x }
        : direction === 'BT' ? { x, y: 160 - y } : { x, y });
    expect(measureRoutedLayoutQuality(nodes, [edge('loop', transformed)], direction))
      .toMatchObject({ backwardTravel: 30, pathLength: 300, bends: 4 });
  });
  it('ignores hidden routes but refuses to score missing visible routes', () => {
    expect(measureRoutedLayoutQuality(nodes, [straight, { ...vertical, hidden: true }]))
      .toMatchObject({ pathLength: 200, crossings: 0, sharedLaneOverlap: 0 });
    expect(measureRoutedLayoutQuality(nodes, [{ ...straight, hidden: true }])).toBeNull();
    expect(measureRoutedLayoutQuality(nodes, [straight, { id: 'missing', source: 'a', target: 'b' }])).toBeNull();
  });
  it('bounds total segment work before pairwise crossing evaluation', () => {
    const long = Array.from({ length: 128 }, (_, index) => ({ x: index * 2, y: 60 }));
    const many = Array.from({ length: 9 }, (_, index) => edge(`route-${index}`, long));
    expect(measureRoutedLayoutQuality(nodes, many.slice(0, 8))).not.toBeNull();
    expect(measureRoutedLayoutQuality(nodes, many)).toBeNull();
  });
  it('uses absolute geometry for nested nodes without modifying inputs', () => {
    const nested = [{ ...nodes[0], type: 'group', position: { x: 100, y: 100 }, width: 300, height: 200 },
      { ...nodes[1], parentId: 'a', position: { x: 20, y: 30 } }];
    const before = structuredClone(nested);
    expect(measureRoutedLayoutQuality(nested, [edge('one', [{ x: 120, y: 150 }, { x: 350, y: 150 }])]))
      .toMatchObject({ width: 300, height: 200 });
    expect(nested).toEqual(before);
  });
  it('fails closed on empty, invalid, diagonal, duplicate and oversized route evidence', () => {
    expect(measureRoutedLayoutQuality([], [straight])).toBeNull();
    expect(measureRoutedLayoutQuality(nodes, [])).toBeNull();
    expect(measureRoutedLayoutQuality([{ ...nodes[0], position: { x: NaN, y: 0 } }, nodes[1]], [straight])).toBeNull();
    expect(measureRoutedLayoutQuality(nodes, [edge('one', [])])).toBeNull();
    expect(measureRoutedLayoutQuality(nodes, [straight, straight])).toBeNull();
    expect(measureRoutedLayoutQuality(nodes, [edge('one', [{ x: 0, y: 0 }, { x: 1, y: 1 }])])).toBeNull();
    for (const x of [NaN, Infinity, 1_000_001]) {
      expect(measureRoutedLayoutQuality(nodes, [edge('one', [{ x: 0, y: 0 }, { x, y: 0 }])])).toBeNull();
    }
    expect(measureRoutedLayoutQuality(Array.from({ length: 129 }, () => nodes[0]), [straight])).toBeNull();
    expect(measureRoutedLayoutQuality(nodes, Array.from({ length: 129 }, () => straight))).toBeNull();
    expect(routedLayoutDominates(null, null)).toBe(false);
  });
});


