import { describe, expect, it } from 'vitest';
import { calculateHierarchicalLayout, decideHierDirectionByFan } from '../hierarchicalLayout';

const nodes = ['a', 'b', 'c', 'd'].map(id => ({ id, position: { x: 0, y: 0 } }));
const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
  { id: 'cd', source: 'c', target: 'd' },
];

describe('hierarchicalLayout', () => {
  it('lays out hierarchy top-to-bottom and records ranks', () => {
    const result = calculateHierarchicalLayout(nodes as never, edges as never, {
      direction: 'TB',
      spacing: { horizontal: 50, vertical: 100 },
      padding: { top: 10, right: 0, bottom: 0, left: 20 },
      itemSize: { width: 100, height: 50 },
      containerSize: { width: 500, height: 400 },
    } as never);

    expect(result.positions).toHaveLength(4);
    expect(result.nodeRanks.get('a')).toBe(0);
    expect(result.nodeRanks.get('b')).toBe(1);
    expect(result.nodeRanks.get('d')).toBe(2);
    expect(result.positions[0].y).toBe(10);
    expect(result.positions[1].y).toBe(160);
  });

  it('lays out hierarchy left-to-right when requested', () => {
    const result = calculateHierarchicalLayout(nodes as never, edges as never, {
      direction: 'LR',
      spacing: { horizontal: 60, vertical: 40 },
      padding: { top: 0, right: 0, bottom: 0, left: 10 },
      itemSize: { width: 80, height: 40 },
      containerSize: { width: 600, height: 300 },
    } as never);

    expect(result.positions[0].x).toBe(10);
    expect(result.positions[1].x).toBe(150);
    expect(result.positions[3].x).toBe(290);
  });

  it('falls back for cyclic graphs and chooses auto directions by heuristics', () => {
    const cyclicNodes = ['a', 'b'].map(id => ({ id, position: { x: 0, y: 0 } }));
    const cyclicEdges = [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'ba', source: 'b', target: 'a' },
    ];

    const result = calculateHierarchicalLayout(cyclicNodes as never, cyclicEdges as never, {
      autoDirection: true,
      containerSize: { width: 800, height: 200 },
      itemSize: { width: 80, height: 40 },
    } as never);

    expect(result.positions).toHaveLength(2);
    expect(result.positions.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);

    expect(decideHierDirectionByFan(nodes as never, edges as never, { direction: 'RL' } as never)).toBe('RL');
    expect(decideHierDirectionByFan(nodes as never, edges as never, { autoDirection: false } as never)).toBe('TB');
    expect(decideHierDirectionByFan(nodes as never, edges as never, {
      autoDirection: true,
      levels: [['a'], ['b', 'c'], ['d']],
      containerSize: { width: 1000, height: 300 },
    } as never)).toBe('LR');
    expect(decideHierDirectionByFan(nodes as never, edges as never, {
      autoDirection: true,
      levels: [['a'], ['b'], ['c'], ['d']],
      containerSize: { width: 300, height: 1000 },
    } as never)).toBe('TB');
  });

  it('falls back to bounded defaults for unsafe heuristic numbers', () => {
    const baseOptions = {
      autoDirection: true,
      levels: [['a'], ['b', 'c'], ['d']],
      containerSize: { width: 900, height: 400 },
    };
    const expected = decideHierDirectionByFan(nodes as never, edges as never, baseOptions as never);

    expect(decideHierDirectionByFan(nodes as never, edges as never, {
      ...baseOptions,
      autoDirectionHeuristics: {
        aspectThresholdLR: Number.NaN,
        aspectThresholdTB: Number.POSITIVE_INFINITY,
        minLevelCountTB: -1,
        minAvgPerLevelLR: Number.MAX_VALUE,
        fanOutDegree: -1,
        fanInDegree: Number.NEGATIVE_INFINITY,
        fanScoreThreshold: 2,
        areaWeight: Number.NaN,
        fanWeight: -1,
        densityWeight: Number.POSITIVE_INFINITY,
        imbalanceWeight: Number.MAX_VALUE,
      },
    } as never)).toBe(expected);
  });
});
