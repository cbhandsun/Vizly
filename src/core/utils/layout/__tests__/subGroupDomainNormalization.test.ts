import { describe, expect, it } from 'vitest';
import {
  equalizeSubGroupMarginsByProjectionWithConfig,
  unifySubGroupHeightsByDomainWithConfig,
  unifySubGroupWidthsByDomainWithConfig,
} from '../subGroupDomainNormalization';

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

const config = {
  domain: {
    padding: { horizontal: 20 },
    sideSafeGap: 8,
  },
};

describe('subGroupDomainNormalization', () => {
  it('unifies visible subgroup heights per domain without mutating input', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 400, { domain: 'D' });
    const short = node('short', 'subGroup', 40, 80, 120, 80, { domain: 'D' });
    const tall = node('tall', 'subGroup', 200, 80, 140, 160, { domain: 'D' });
    const hidden = node('hidden', 'subGroup', 360, 80, 100, 240, {
      domain: 'D',
      hidden: true,
    });

    const result = unifySubGroupHeightsByDomainWithConfig([domain, short, tall, hidden]);

    expect(result.find(item => item.id === 'short')?.measured).toEqual({
      width: 120,
      height: 160,
    });
    expect(result.find(item => item.id === 'tall')?.height).toBe(160);
    expect(result.find(item => item.id === 'hidden')?.measured?.height).toBe(240);
    expect(short.measured.height).toBe(80);
    expect(short.style.height).toBe(80);
  });

  it('uses the full target width for center alignment', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 400, { domain: 'D' });
    const first = node('first', 'subGroup', 40, 80, 100, 80, { domain: 'D' });
    const second = node('second', 'subGroup', 180, 80, 200, 100, { domain: 'D' });

    const result = unifySubGroupWidthsByDomainWithConfig(
      [domain, first, second],
      { NODE_MIN_WIDTH: 120 },
      config,
      'CENTER',
    );

    expect(result.find(item => item.id === 'first')?.measured?.width).toBe(444);
    expect(result.find(item => item.id === 'second')?.measured).toEqual({
      width: 444,
      height: 100,
    });
  });

  it('caps non-center alignment at the largest current subgroup width', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 400, { domain: 'D' });
    const first = node('first', 'subGroup', 40, 80, 100, 80, { domain: 'D' });
    const second = node('second', 'subGroup', 180, 80, 200, 100, { domain: 'D' });

    const result = unifySubGroupWidthsByDomainWithConfig(
      [domain, first, second],
      { NODE_MIN_WIDTH: 120 },
      config,
      'left',
    );

    expect(result.find(item => item.id === 'first')?.measured?.width).toBe(200);
    expect(result.find(item => item.id === 'second')?.width).toBe(200);
  });

  it('equalizes horizontal margins and translates referenced children', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 400, { domain: 'D' });
    const group = node('group', 'subGroup', 40, 80, 100, 80, {
      domain: 'D',
      children: ['child', 42, 'missing'],
    });
    const child = node('child', 'default', 60, 110, 60, 30);

    const result = equalizeSubGroupMarginsByProjectionWithConfig(
      [domain, group, child],
      config,
    );

    expect(result.find(item => item.id === 'group')?.position.x).toBe(200);
    expect(result.find(item => item.id === 'child')?.position.x).toBe(220);
    expect(group.position.x).toBe(40);
    expect(child.position.x).toBe(60);
  });

  it('bounds invalid geometry and handles empty input', () => {
    expect(unifySubGroupHeightsByDomainWithConfig([])).toEqual([]);

    const domain = node(
      'domain',
      'titleGroup',
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      400,
      { domain: 'D' },
    );
    const group = node(
      'group',
      'subGroup',
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      { domain: 'D' },
    );

    const result = unifySubGroupWidthsByDomainWithConfig(
      [domain, group],
      { NODE_MIN_WIDTH: Number.POSITIVE_INFINITY },
      {
        domain: {
          padding: { horizontal: Number.POSITIVE_INFINITY },
          sideSafeGap: Number.NEGATIVE_INFINITY,
        },
      },
      null,
    );

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Number.isFinite(item.measured?.width)).toBe(true);
      expect(Number.isFinite(item.measured?.height)).toBe(true);
    }
  });
});
