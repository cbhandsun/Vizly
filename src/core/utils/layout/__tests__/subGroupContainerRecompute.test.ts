import { describe, expect, it, vi } from 'vitest';
import { recomputeSubGroupContainersWithConfig } from '../subGroupContainerRecompute';

const node = (
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Record<string, unknown> = {},
) => ({
  id,
  type,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data,
}) as any;

const layoutConfig = {
  NODE_H_GAP: 50,
  NODE_V_GAP: 40,
  SUB_GROUP_MIN_HEIGHT: 200,
  SUB_GROUP_PADDING: { H: 20, V_TOP: 40, V_BOTTOM: 20 },
  SUB_GROUP_TITLE_CLEARANCE: 40,
  ENSURE_SUB_GROUP_TITLE_CLEARANCE: true,
};

const config = {
  subDomain: {
    padding: { horizontal: 20, top: 40, bottom: 20 },
    title: { height: 30, padding: { vertical: 6 } },
  },
};

describe('subGroupContainerRecompute', () => {
  it('fits a subgroup to unique visible semantic children without mutating inputs', () => {
    const inputs = [
      node('group', 'subGroup', 100, 100, 400, 250, {
        domain: 'D',
        children: ['a', 'a', 'hidden', 'missing', 42],
      }),
      node('a', 'default', 200, 180, 60, 30, { domain: 'D' }),
      node('hidden', 'default', 500, 500, 60, 30, {
        domain: 'D',
        hidden: true,
      }),
    ];
    const result = recomputeSubGroupContainersWithConfig(
      inputs, layoutConfig, config,
    ) as any[];
    const group = result[0];

    expect(group.position).toEqual({ x: 178, y: 100 });
    expect(group.measured).toEqual({ width: 105, height: 200 });
    expect(group.zIndex).toBe(-5);
    expect(inputs[0].position).toEqual({ x: 100, y: 100 });
    expect(inputs[0].measured).toEqual({ width: 400, height: 250 });
  });

  it('uses a finite Dagre size marker and does not serialize marker contents', () => {
    const debug = vi.fn();
    const marker: Record<string, unknown> = { w: 260, h: 180 };
    marker.self = marker;
    const result = recomputeSubGroupContainersWithConfig(
      [
        node('group', 'subGroup', 100, 100, 400, 250, {
          description: 'Sensitive group description',
          __dagreSized: marker,
          children: [],
        }),
      ],
      layoutConfig,
      config,
      { logger: { debug } },
    ) as any[];

    expect(result[0].measured).toEqual({ width: 260, height: 180 });
    expect(debug).toHaveBeenCalledWith(
      '[DAGRE-MARKER] id="group" dagreSized=valid',
    );
    expect(debug.mock.calls.flat().join(' ')).not.toContain('Sensitive');
    expect(debug.mock.calls.flat().join(' ')).not.toContain('"self"');
  });

  it('falls back to same-domain geometry when semantic children are absent', () => {
    const result = recomputeSubGroupContainersWithConfig(
      [
        node('group', 'subGroup', 100, 100, 300, 250, {
          domain: 'D',
          children: [],
        }),
        node('inside', 'default', 200, 200, 60, 30, { domain: 'D' }),
        node('other-domain', 'default', 210, 200, 200, 100, { domain: 'X' }),
      ],
      layoutConfig,
      config,
    ) as any[];

    expect(result[0].position).toEqual({ x: 178, y: 120 });
    expect(result[0].measured).toEqual({ width: 105, height: 200 });
  });

  it('safely shrinks an empty subgroup even when style is missing', () => {
    const group = node('group', 'subGroup', 100, 100, 300, 250, {
      domain: 'D',
      children: [],
    });
    delete group.style;
    const result = recomputeSubGroupContainersWithConfig(
      [group], layoutConfig, config,
    ) as any[];

    expect(result[0].style).toEqual({ width: 300, height: 116 });
    expect(result[0].measured).toEqual({ width: 300, height: 116 });
  });

  it('bounds invalid coordinates, dimensions, markers, and configuration', () => {
    const result = recomputeSubGroupContainersWithConfig(
      [
        node(
          'group',
          'subGroup',
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          {
            domain: 'D',
            children: ['child'],
            __dagreSized: {
              w: Number.POSITIVE_INFINITY,
              h: Number.NEGATIVE_INFINITY,
            },
          },
        ),
        node(
          'child',
          'default',
          Number.NEGATIVE_INFINITY,
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          { domain: 'D' },
        ),
      ],
      {
        NODE_H_GAP: Number.POSITIVE_INFINITY,
        NODE_V_GAP: Number.NEGATIVE_INFINITY,
        SUB_GROUP_MIN_HEIGHT: Number.POSITIVE_INFINITY,
      },
      {
        subDomain: {
          padding: {
            horizontal: Number.POSITIVE_INFINITY,
            top: Number.NEGATIVE_INFINITY,
            bottom: Number.NaN,
          },
        },
      },
    ) as any[];

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Number.isFinite(item.measured.width)).toBe(true);
      expect(Number.isFinite(item.measured.height)).toBe(true);
    }
  });
});
