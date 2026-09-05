import shortBranchInputs from './shortBranchLabelArrangement.json';
import { describe, expect, it } from 'vitest';
import { arrangeEdgeLabels, edgeLabelRectsConflict, edgeLabelSegmentIntersectsRect,
  type EdgeLabelArrangementInput } from '../edgeLabelArrangement';

const input = (id: string, y = 0): EdgeLabelArrangementInput => ({
  id, path: [{ x: 0, y }, { x: 300, y }], labelPath: [{ x: 0, y }, { x: 300, y }],
  anchor: { x: 150, y }, preferredCenter: { x: 150, y: y + 75.5 },
  text: '完整条件'.repeat(35), size: { width: 221, height: 135 }, scale: 1, manual: false, obstacles: [],
});

describe('global edge label arrangement regression', () => {
  it.each([false, true])('places a scaled short-branch callout outside the segment while keeping its anchor (transpose=%s)', transpose => {
    const point = (p: { x: number; y: number }) => transpose ? { x: p.y, y: p.x } : p;
    const entries = shortBranchInputs.map(entry => ({ ...entry,
      path: entry.path.map(point), labelPath: entry.labelPath.map(point),
      anchor: point(entry.anchor), preferredCenter: point(entry.preferredCenter),
      size: transpose ? { width: entry.size.height, height: entry.size.width } : entry.size,
      obstacles: entry.obstacles.map(rect => transpose
        ? { x: rect.y, y: rect.x, width: rect.height, height: rect.width } : rect),
    }));
    const before = structuredClone(entries);
    const result = arrangeEdgeLabels(entries);
    expect([...result.values()].every(placement => placement.status === 'placed')).toBe(true);
    const short = result.get('e-order-sla');
    expect(short?.conflicts).toBe(0);
    expect(short?.leaderEnd).toBeDefined();
    expect(transpose ? short?.anchor.x : short?.anchor.y).toBe(1582);
    expect(transpose ? short?.anchor.y : short?.anchor.x).toBeGreaterThanOrEqual(574.5);
    expect(transpose ? short?.anchor.y : short?.anchor.x).toBeLessThanOrEqual(622.5);
    expect(entries).toEqual(before);
  });

  it.each([false, true])('finds a free interval between obstacles when fixed anchors are blocked (transpose=%s)', transpose => {
    const point = (x: number, y: number) => transpose ? { x: y, y: x } : { x, y };
    const entry: EdgeLabelArrangementInput = {
      id: 'gap', path: [point(0, 0), point(1000, 0)], labelPath: [point(0, 0), point(1000, 0)],
      anchor: point(500, 0), preferredCenter: point(500, 30), text: 'condition',
      size: { width: transpose ? 20 : 80, height: transpose ? 80 : 20 }, scale: 1, manual: false,
      obstacles: [-100, 400, 900].map(x => transpose
        ? { x: -500, y: x, width: 1000, height: 200 }
        : { x, y: -500, width: 200, height: 1000 }),
    };
    const placement = arrangeEdgeLabels([entry]).get(entry.id);
    expect(placement?.status).toBe('placed');
    expect(placement?.conflicts).toBe(0);
    expect(placement && entry.obstacles.some(obstacle => edgeLabelRectsConflict(placement.rect, obstacle))).toBe(false);
  });

  it.each([0, 96])('separates measured long labels on collapsed or parallel branches (y=%s)', y => {
    const plan = arrangeEdgeLabels([input('a'), input('b', y)]);
    const a = plan.get('a');
    const b = plan.get('b');
    expect(a?.status).toBe('placed');
    expect(b?.status).toBe('placed');
    expect(a && b && edgeLabelRectsConflict(a.rect, b.rect)).toBe(false);
  });

  it('is independent of mount order and leaves source geometry untouched', () => {
    const inputs = [input('c'), input('a'), input('b')];
    const before = structuredClone(inputs);
    expect(arrangeEdgeLabels(inputs)).toEqual(arrangeEdgeLabels([...inputs].reverse()));
    expect(inputs).toEqual(before);
  });

  it.each(['TB', 'BT', 'LR', 'RL'])('separates branch labels in direction %s', direction => {
    const transform = ({ x, y }: { x: number; y: number }) => {
      if (direction === 'TB') return { x: y, y: x };
      if (direction === 'BT') return { x: y, y: -x };
      if (direction === 'RL') return { x: -x, y };
      return { x, y };
    };
    const entries = [input('a'), input('b', 96)].map(entry => ({
      ...entry, path: entry.path.map(transform), labelPath: entry.labelPath.map(transform),
      anchor: transform(entry.anchor), preferredCenter: transform(entry.preferredCenter),
    }));
    const plan = arrangeEdgeLabels(entries);
    const a = plan.get('a');
    const b = plan.get('b');
    expect(a?.status).toBe('placed');
    expect(b?.status).toBe('placed');
    expect(a && b && edgeLabelRectsConflict(a.rect, b.rect)).toBe(false);
  });

  it.each([1, 1.44, 2.4])('uses unscaled measurements once at readability scale %s', scale => {
    const plan = arrangeEdgeLabels([{ ...input('a'), scale }, { ...input('b'), scale }]);
    const a = plan.get('a');
    const b = plan.get('b');
    expect(a?.rect.width).toBe(221 * scale);
    expect(a?.rect.height).toBe(135 * scale);
    expect(a && b && edgeLabelRectsConflict(a.rect, b.rect)).toBe(false);
  });

  it('preserves manual positions and reserves their rectangle before automatic labels', () => {
    const fixed = { ...input('z'), manual: true };
    const plan = arrangeEdgeLabels([input('a'), fixed]);
    expect(plan.get('z')?.center).toEqual(fixed.preferredCenter);
    expect(plan.get('z')?.status).toBe('manual');
    const a = plan.get('a');
    const z = plan.get('z');
    expect(a && z && edgeLabelRectsConflict(a.rect, z.rect)).toBe(false);
  });

  it('avoids nodes and arrow clearance and never draws a leader through nodes', () => {
    const nodes = [{ x: 90, y: 25, width: 120, height: 80 }];
    const result = arrangeEdgeLabels([{ ...input('a'), obstacles: nodes }]).get('a');
    expect(result?.status).toBe('placed');
    expect(result && edgeLabelRectsConflict(result.rect, nodes[0], 10)).toBe(false);
    expect(result?.leaderEnd && edgeLabelSegmentIntersectsRect(result.anchor, result.leaderEnd, nodes[0])).toBe(false);
  });

  it('anchors the leader to its visible semantic branch rather than the common trunk', () => {
    const branch = [{ x: 200, y: 0 }, { x: 300, y: 0 }];
    const result = arrangeEdgeLabels([{ ...input('a'), labelPath: branch,
      anchor: { x: 250, y: 0 }, preferredCenter: { x: 250, y: 76 } }]).get('a');
    expect(result?.anchor.x).toBeGreaterThanOrEqual(200);
    expect(result?.anchor.x).toBeLessThanOrEqual(300);
    expect(result?.anchor.y).toBe(0);
  });

  it('reports bounded exhaustion in an enclosed scene and omits an obstructed leader', () => {
    const result = arrangeEdgeLabels([{ ...input('a'),
      obstacles: [{ x: -1000, y: -1000, width: 3000, height: 3000 }] }]).get('a');
    expect(result?.status).toBe('unresolved');
    expect(result?.conflicts).toBeGreaterThan(0);
    expect(result?.leaderEnd).toBeUndefined();
    expect(Math.abs(result?.center.y ?? Infinity)).toBeLessThan(500);
  });

  it('preserves hostile-looking text as inert input', () => {
    const unsafe = '<img src=x onerror=alert(1)>'.repeat(100);
    expect(arrangeEdgeLabels([{ ...input('a'), text: unsafe }]).get('a')?.rect.width).toBe(221);
  });

  it('ignores empty labels but still reserves their final paths', () => {
    const result = arrangeEdgeLabels([input('a'), { ...input('b', 150), text: '' }]);
    expect(result.has('b')).toBe(false);
    expect(result.get('a')?.status).toBe('placed');
    expect(result.get('a')?.center.y).toBeLessThan(0);
  });

  it('rejects invalid and excessive paths and handles empty input or invalid dimensions', () => {
    expect(arrangeEdgeLabels([]).size).toBe(0);
    expect(arrangeEdgeLabels([{ ...input('a'), path: [{ x: NaN, y: 0 }, { x: 1, y: 0 }] }]).size).toBe(0);
    expect(arrangeEdgeLabels([{ ...input('a'), path: Array.from({ length: 513 }, () => ({ x: 0, y: 0 })) }]).size).toBe(0);
    const result = arrangeEdgeLabels([{ ...input('a'), scale: Infinity,
      size: { width: -1, height: NaN }, obstacles: [{ x: NaN, y: 0, width: 10, height: 10 }] }]).get('a');
    expect(Number.isFinite(result?.rect.width)).toBe(true);
  });

  it('clips diagonal leaders correctly', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(edgeLabelSegmentIntersectsRect({ x: -5, y: -5 }, { x: 15, y: 15 }, rect)).toBe(true);
    expect(edgeLabelSegmentIntersectsRect({ x: -5, y: 15 }, { x: 15, y: 20 }, rect)).toBe(false);
  });
});
