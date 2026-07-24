import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/DiagramConfig', () => ({
  diagramConfigManager: {
    getConfig: () => ({
      subDomain: {
        padding: { horizontal: 20, top: 40, bottom: 20 },
        title: { height: 30, padding: { vertical: 6 }, safeGap: 4 },
      },
    }),
    getLayoutConfig: () => ({ SUB_GROUP_PADDING: { H: 20 } }),
  },
}));

import {
  packSubGroupChildrenRigid,
  reflowSubGroupChildrenGrid,
  reflowSubGroupChildrenVertical,
} from '../subGroupChildPacking';

const subgroup = (width = 300, height = 240): ReactFlowNode => ({
  id: 'subgroup',
  type: 'subGroup',
  position: { x: 100, y: 100 },
  measured: { width, height },
  data: {},
});

const child = (
  id: string,
  relativeX: number,
  relativeY: number,
  width = 60,
  height = 30,
): ReactFlowNode => ({
  id,
  position: { x: 0, y: 0 },
  measured: { width, height },
  data: { __rel: { x: relativeX, y: relativeY } },
});

describe('subGroupChildPacking', () => {
  it('returns only the subgroup for empty child input', () => {
    const container = subgroup();

    expect(packSubGroupChildrenRigid(container, [], 20, 20)).toEqual([container]);
    expect(reflowSubGroupChildrenVertical(container, [], 20, 20)).toEqual([container]);
    expect(reflowSubGroupChildrenGrid(container, [], 20, 20)).toEqual([container]);
  });

  it('preserves relative row order while enforcing minimum horizontal gaps', () => {
    const result = packSubGroupChildrenRigid(
      subgroup(260, 180),
      [child('second', 10, 0), child('first', 0, 0)],
      30,
      35,
    );
    const first = result.find((node) => node.id === 'first')!;
    const second = result.find((node) => node.id === 'second')!;

    expect(first.position).toEqual({ x: 120, y: 180 });
    expect(second.position.x - first.position.x).toBe(90);
  });

  it('stacks children vertically in relative-position order', () => {
    const result = reflowSubGroupChildrenVertical(
      subgroup(),
      [child('second', 0, 80), child('first', 0, 0)],
      20,
      35,
    );

    expect(result.map((node) => node.id)).toEqual(['subgroup', 'first', 'second']);
    expect(result[1].position).toEqual({ x: 220, y: 180 });
    expect(result[2].position.y).toBe(245);
  });

  it('wraps grid rows when children exceed the available width', () => {
    const result = reflowSubGroupChildrenGrid(
      subgroup(220),
      [child('first', 0, 0, 100), child('second', 10, 0, 100)],
      20,
      20,
    );

    expect(result[1].position.y).toBe(180);
    expect(result[2].position.y).toBe(230);
  });

  it('coerces non-finite geometry and gap inputs to finite output', () => {
    const invalid = child('invalid', Number.NaN, Number.POSITIVE_INFINITY);
    invalid.position = { x: Number.NaN, y: Number.NEGATIVE_INFINITY };
    invalid.measured = { width: Number.POSITIVE_INFINITY, height: -10 };

    const layouts = [
      packSubGroupChildrenRigid(subgroup(), [invalid], Number.NaN, Number.POSITIVE_INFINITY),
      reflowSubGroupChildrenVertical(subgroup(), [invalid], Number.NaN, Number.NEGATIVE_INFINITY),
      reflowSubGroupChildrenGrid(subgroup(), [invalid], Number.POSITIVE_INFINITY, Number.NaN),
    ];

    for (const result of layouts) {
      expect(Number.isFinite(result[1].position.x)).toBe(true);
      expect(Number.isFinite(result[1].position.y)).toBe(true);
    }
  });
});
