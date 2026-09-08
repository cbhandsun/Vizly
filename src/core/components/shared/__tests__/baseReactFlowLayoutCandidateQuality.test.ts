// @vitest-environment node
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { measureRoutedLayoutQuality, routedLayoutDominates } from './routedLayoutQuality';

const nodes: Node[] = [
  { id: 'a', data: {}, position: { x: 0, y: 0 }, width: 40, height: 40 },
  { id: 'b', data: {}, position: { x: 160, y: 120 }, width: 40, height: 40 },
];
const edge = (id: string, path: { x: number; y: number }[]): Edge => ({
  id, source: 'a', target: 'b', data: { computedPath: path },
});
const straight = edge('one', [{ x: 0, y: 60 }, { x: 200, y: 60 }]);
const vertical = edge('two', [{ x: 100, y: 0 }, { x: 100, y: 160 }]);

describe('routed layout candidate quality', () => {
  it('measures actual route crossings and detours with identical node positions', () => {
    const crossed = measureRoutedLayoutQuality(nodes, [straight, vertical]);
    const detour = edge('two', [{ x: 100, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 160 }, { x: 100, y: 160 }]);
    const routed = measureRoutedLayoutQuality(nodes, [straight, detour]);
    expect(crossed).toMatchObject({ width: 200, height: 160, crossings: 1, pathLength: 360, bends: 0 });
    expect(routed).toMatchObject({ width: 220, crossings: 0, pathLength: 600, bends: 2 });
    expect(routedLayoutDominates(crossed, routed)).toBe(false);
  });
  it('accepts shorter routed paths without widening the graph or adding crossings', () => {
    const baseline = { width: 200, height: 160, crossings: 1, pathLength: 600, bends: 2, backwardTravel: 0 };
    const candidate = { ...baseline, height: 120, pathLength: 400, crossings: 0 };
    expect(routedLayoutDominates(baseline, candidate)).toBe(true);
    expect(routedLayoutDominates(candidate, candidate)).toBe(false);
    for (const key of ['width', 'height', 'crossings', 'pathLength', 'bends', 'backwardTravel'] as const) {
      expect(routedLayoutDominates(baseline, { ...candidate, [key]: baseline[key] + 1 })).toBe(false);
    }
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
      .toMatchObject({ pathLength: 200, crossings: 0 });
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
