import { describe, expect, it } from 'vitest';
import {
  alignSubGroupGridRows,
  alignSubGroupStack,
  centerSubGroupChildrenHorizontallyWithConfig,
  centerSubGroupChildrenVerticallyWithConfig,
  enforceSubGroupChildrenLayoutStrictWithConfig,
  leftAlignSubGroupChildrenHorizontallyWithConfig,
  layoutSubGroupChildrenInRow,
  layoutSubGroupChildrenFlow,
} from '../subGroupChildAlignment';

const node = (id: string, x: number, y: number, width: number, height: number) => ({
  id,
  position: { x, y },
  measured: { width, height },
  data: {},
}) as any;

describe('subGroupChildAlignment', () => {
  it('centers children vertically inside the subgroup content area', () => {
    const group = {
      ...node('group', 100, 100, 400, 300),
      type: 'subGroup',
      data: { children: ['first', 'second'] },
    };
    const first = node('first', 130, 180, 100, 40);
    const second = node('second', 250, 180, 100, 40);

    const result = centerSubGroupChildrenVerticallyWithConfig(
      [group, first, second],
      {},
      {},
    );

    expect(result.find(item => item.id === 'first')?.position.y).toBe(259);
    expect(result.find(item => item.id === 'second')?.position.y).toBe(259);
    expect(first.position.y).toBe(180);
  });

  it('centers and left-aligns visual rows within subgroup bounds', () => {
    const group = {
      ...node('group', 100, 100, 300, 240),
      type: 'subGroup',
      data: { children: ['first', 'second', 'third'] },
    };
    const first = node('first', 100, 160, 60, 30);
    const second = node('second', 250, 160, 60, 30);
    const third = node('third', 160, 240, 60, 30);
    const input = [group, first, second, third];
    const layout = {
      NODE_H_GAP: 50,
      NODE_V_GAP: 40,
      NODE_MIN_WIDTH: 60,
      SUB_GROUP_PADDING: { H: 20 },
    };

    const centered = centerSubGroupChildrenHorizontallyWithConfig(input, layout, {});
    expect(centered.find(item => item.id === 'first')?.position).toEqual({ x: 165, y: 160 });
    expect(centered.find(item => item.id === 'second')?.position).toEqual({ x: 275, y: 160 });
    expect(centered.find(item => item.id === 'third')?.position).toEqual({ x: 220, y: 240 });

    const leftAligned = leftAlignSubGroupChildrenHorizontallyWithConfig(input, layout, {});
    expect(leftAligned.find(item => item.id === 'first')?.position).toEqual({ x: 120, y: 160 });
    expect(leftAligned.find(item => item.id === 'second')?.position).toEqual({ x: 230, y: 160 });
    expect(leftAligned.find(item => item.id === 'third')?.position).toEqual({ x: 120, y: 240 });
    expect(first.position).toEqual({ x: 100, y: 160 });
  });

  it('enforces horizontal, centered, and vertical strict layouts', () => {
    const group = {
      ...node('group', 100, 100, 400, 300),
      type: 'subGroup',
      data: { children: ['first', 'second'] },
    };
    const first = node('first', 0, 0, 60, 30);
    const second = node('second', 0, 0, 60, 30);
    const layoutConfig = {
      NODE_H_GAP: 20,
      NODE_V_GAP: 20,
      NODE_MIN_WIDTH: 60,
      SUB_GROUP_PADDING: { H: 20, V_TOP: 40, V_BOTTOM: 20 },
      SUB_GROUP_TITLE_HEIGHT: 30,
      SUB_GROUP_TITLE_SAFE_GAP: 6,
      SUB_GROUP_TITLE_CLEARANCE: 40,
      ENSURE_SUB_GROUP_TITLE_CLEARANCE: true,
    };

    const horizontal = enforceSubGroupChildrenLayoutStrictWithConfig(
      [group, first, second],
      'horizontal',
      layoutConfig,
      {},
    );
    expect(horizontal.find(item => item.id === 'first')?.position).toEqual({ x: 230, y: 180 });
    expect(horizontal.find(item => item.id === 'second')?.position).toEqual({ x: 310, y: 180 });

    const centered = enforceSubGroupChildrenLayoutStrictWithConfig(
      [group, first, second],
      'centered',
      layoutConfig,
      {},
    );
    expect(centered.find(item => item.id === 'first')?.position).toEqual({ x: 230, y: 180 });

    const vertical = enforceSubGroupChildrenLayoutStrictWithConfig(
      [group, first, second],
      'vertical',
      layoutConfig,
      {},
    );
    expect(vertical.find(item => item.id === 'first')?.position).toEqual({ x: 270, y: 180 });
    expect(vertical.find(item => item.id === 'second')?.position).toEqual({ x: 270, y: 230 });
    expect(first.position).toEqual({ x: 0, y: 0 });
  });

  it('lays out strict grids and resizes the subgroup to its content', () => {
    const group = {
      ...node('group', 100, 100, 400, 300),
      type: 'subGroup',
      data: { domain: 'D', children: ['a', 'b', 'c', 'd'] },
    };
    const children = ['a', 'b', 'c', 'd'].map(id => node(id, 0, 0, 60, 30));

    const result = enforceSubGroupChildrenLayoutStrictWithConfig(
      [group, ...children],
      'grid',
      {
        NODE_H_GAP: 20,
        NODE_V_GAP: 20,
        NODE_MIN_WIDTH: 60,
        SUB_GROUP_PADDING: { H: 20, V_BOTTOM: 20 },
        SUB_GROUP_TITLE_HEIGHT: 30,
        SUB_GROUP_TITLE_SAFE_GAP: 6,
      },
      {},
    );
    const resized = result.find(item => item.id === 'group');

    expect(result.find(item => item.id === 'a')?.position).toEqual({ x: 190, y: 136 });
    expect(result.find(item => item.id === 'd')?.position).toEqual({ x: 270, y: 186 });
    expect(resized?.measured).toEqual({ width: 260, height: 128 });
    expect(resized?.style?.width).toBe(260);
  });

  it('coerces unknown strict layouts and ignores hidden or invalid children', () => {
    const group = {
      ...node('group', 0, 0, 300, 200),
      type: 'subGroup',
      data: { children: ['visible', 'hidden', 'nested', 42, 'missing'] },
    };
    const visible = node('visible', 0, 0, 60, 30);
    const hidden = { ...node('hidden', 90, 90, 60, 30), data: { hidden: true } };
    const nested = { ...node('nested', 120, 90, 60, 30), type: 'subGroup' };

    const result = enforceSubGroupChildrenLayoutStrictWithConfig(
      [group, visible, hidden, nested] as any,
      'unknown',
      { NODE_H_GAP: 20, NODE_MIN_WIDTH: 60, SUB_GROUP_PADDING: { H: 20 } },
      {},
    );

    expect(result.find(item => item.id === 'visible')?.position.x).toBe(120);
    expect(result.find(item => item.id === 'hidden')?.position).toEqual({ x: 90, y: 90 });
    expect(result.find(item => item.id === 'nested')?.position).toEqual({ x: 120, y: 90 });
  });

  it('ignores invalid, hidden, and container child references during horizontal alignment', () => {
    const group = {
      ...node('group', 0, 0, 300, 200),
      type: 'subGroup',
      data: { children: ['visible', 42, 'missing', 'hidden', 'nested'] },
    };
    const visible = node('visible', 80, 100, 60, 30);
    const hidden = { ...node('hidden', 120, 100, 60, 30), data: { hidden: true } };
    const nested = { ...node('nested', 160, 100, 60, 30), type: 'subGroup' };

    const result = leftAlignSubGroupChildrenHorizontallyWithConfig(
      [group, visible, hidden, nested] as any,
      { SUB_GROUP_PADDING: { H: 20 } },
      {},
    );

    expect(result.find(item => item.id === 'visible')?.position.x).toBe(20);
    expect(result.find(item => item.id === 'hidden')?.position.x).toBe(120);
    expect(result.find(item => item.id === 'nested')?.position.x).toBe(160);
  });

  it('does not move content that is taller than the available subgroup area', () => {
    const group = {
      ...node('group', 0, 0, 300, 120),
      type: 'subGroup',
      data: { children: ['child'] },
    };
    const child = node('child', 10, 70, 100, 100);

    const result = centerSubGroupChildrenVerticallyWithConfig([group, child], {}, {});

    expect(result.find(item => item.id === 'child')?.position.y).toBe(70);
  });

  it('lays out a single row with safe dimensions and vertical centering', () => {
    const tall = node('tall', 0, 0, 140, 100);
    const short = node('short', 0, 0, 100, 40);

    layoutSubGroupChildrenInRow(
      [tall, short],
      node('group', 10, 20, 400, 300),
      { NODE_H_GAP: 20, NODE_MIN_WIDTH: 120 },
      {},
    );

    expect(tall.position).toEqual({ x: 34, y: 94 });
    expect(short.position).toEqual({ x: 194, y: 104 });
  });

  it('centers different-height nodes within each detected grid row', () => {
    const tall = node('tall', 0, 10, 100, 100);
    const short = node('short', 120, 12, 100, 40);

    alignSubGroupGridRows([tall, short]);

    expect(tall.position.y).toBe(10);
    expect(short.position.y).toBe(40);
  });

  it('centers a vertical stack against the widest child', () => {
    const wide = node('wide', 10, 0, 200, 40);
    const narrow = node('narrow', 20, 80, 100, 40);

    alignSubGroupStack([wide, narrow]);

    expect(wide.position.x).toBe(10);
    expect(narrow.position.x).toBe(60);
  });

  it('wraps flow rows at the configured width and preserves row height', () => {
    const first = node('first', 0, 0, 120, 40);
    const second = node('second', 0, 0, 120, 50);
    const subGroup = node('group', 10, 20, 400, 300);

    layoutSubGroupChildrenFlow(
      [first, second],
      subGroup,
      { NODE_H_GAP: 12, NODE_V_GAP: 12, NODE_MIN_WIDTH: 120 },
      { subGroup: { maxWidth: 250 } },
    );

    expect(first.position).toEqual({ x: 34, y: 94 });
    expect(second.position).toEqual({ x: 34, y: 146 });
  });

  it('handles empty input and invalid measurements with bounded fallbacks', () => {
    expect(() => alignSubGroupGridRows([])).not.toThrow();
    expect(() => alignSubGroupStack([])).not.toThrow();

    const invalid = node('invalid', Number.NaN, Number.POSITIVE_INFINITY, -1, Number.NaN);
    layoutSubGroupChildrenFlow([invalid], node('group', 0, 0, 1, 1), {}, {});

    expect(invalid.position.x).toBe(24);
    expect(invalid.position.y).toBe(74);
  });

  it('bounds infinite and extreme layout configuration values', () => {
    const child = node('bounded', Number.NaN, Number.NaN, Number.POSITIVE_INFINITY, 40);

    layoutSubGroupChildrenInRow(
      [child],
      node('group', Number.POSITIVE_INFINITY, Number.NaN, 1, 1),
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_MIN_WIDTH: Number.POSITIVE_INFINITY,
        SUB_GROUP_TITLE_HEIGHT: Number.POSITIVE_INFINITY,
      },
      {
        subDomain: {
          padding: { horizontal: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY },
          title: { padding: { vertical: Number.POSITIVE_INFINITY } },
        },
      },
    );

    expect(Number.isFinite(child.position.x)).toBe(true);
    expect(Number.isFinite(child.position.y)).toBe(true);
    expect(child.position.x).toBeLessThanOrEqual(10_000);
    expect(child.position.y).toBeLessThanOrEqual(30_000);
  });

  it('keeps horizontal alignment finite under invalid and extreme measurements', () => {
    const group = {
      ...node('group', Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY, 200),
      type: 'subGroup',
      data: { children: ['child'] },
    };
    const child = node(
      'child',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NaN,
    );

    const centered = centerSubGroupChildrenHorizontallyWithConfig(
      [group, child],
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_V_GAP: -1,
        NODE_MIN_WIDTH: Number.POSITIVE_INFINITY,
        SUB_GROUP_PADDING: { H: Number.POSITIVE_INFINITY },
      },
      { layout: { mainColumnWidth: Number.POSITIVE_INFINITY } },
    );
    const centeredChild = centered.find(item => item.id === 'child');

    expect(Number.isFinite(centeredChild?.position.x)).toBe(true);
    expect(Number.isFinite(centeredChild?.position.y)).toBe(true);
    expect(centeredChild?.position.x).toBeLessThanOrEqual(100_000);

    const leftAligned = leftAlignSubGroupChildrenHorizontallyWithConfig(
      [group, child],
      {},
      {},
    );
    expect(leftAligned.find(item => item.id === 'child')?.position.x).toBeNaN();
  });

  it('bounds strict layout configuration and extreme measurements', () => {
    const group = {
      ...node(
        'group',
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.NaN,
      ),
      type: 'subGroup',
      data: { children: ['first', 'second'] },
    };
    const first = node('first', Number.NaN, Number.POSITIVE_INFINITY, -1, Number.NaN);
    const second = node(
      'second',
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );

    const result = enforceSubGroupChildrenLayoutStrictWithConfig(
      [group, first, second],
      'vertical',
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_V_GAP: Number.NEGATIVE_INFINITY,
        NODE_MIN_WIDTH: Number.POSITIVE_INFINITY,
        SUB_GROUP_PADDING: {
          H: Number.POSITIVE_INFINITY,
          V_TOP: Number.NEGATIVE_INFINITY,
        },
      },
      {
        node: { height: Number.POSITIVE_INFINITY },
        layout: { mainColumnWidth: Number.POSITIVE_INFINITY },
      },
    );

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Math.abs(item.position.x)).toBeLessThanOrEqual(110_000);
      expect(Math.abs(item.position.y)).toBeLessThanOrEqual(110_000);
    }
  });
});
