import { describe, expect, it } from 'vitest';
import { scaleDomainContentToFitWidthWithConfig } from '../domainContentScaling';

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

describe('domainContentScaling', () => {
  it('scales visible same-domain members to the full available width', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 360, { domain: 'D' });
    const group = node('group', 'subGroup', 100, 120, 100, 80, { domain: 'D' });
    const child = node('child', 'default', 250, 140, 60, 30, { domain: 'D' });

    const result = scaleDomainContentToFitWidthWithConfig(
      [domain, group, child],
      config,
    );
    const scaledGroup = result.find(item => item.id === 'group');
    const scaledChild = result.find(item => item.id === 'child');

    expect(scaledGroup?.position.x).toBe(28);
    expect(scaledGroup?.measured?.width).toBeGreaterThan(100);
    expect(scaledChild?.position.x).toBeGreaterThan(
      (scaledGroup?.position.x ?? 0) + (scaledGroup?.measured?.width ?? 0),
    );
    expect(result.find(item => item.id === 'domain')?.measured?.width).toBe(500);
  });

  it('preserves legacy width behavior behind an explicit option', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 300, 200, { domain: 'D' });
    const member = { ...node('member', 'default', 50, 80, 100, 30, { domain: 'D' }), width: 100 };

    const ordinary = scaleDomainContentToFitWidthWithConfig([domain, member], config);
    const legacy = scaleDomainContentToFitWidthWithConfig(
      [domain, member],
      config,
      { syncLegacyWidth: true },
    );

    expect(ordinary.find(item => item.id === 'member')?.width).toBe(100);
    expect(legacy.find(item => item.id === 'member')?.width).toBe(
      legacy.find(item => item.id === 'member')?.measured?.width,
    );
  });

  it('does not mutate nested geometry objects from the caller', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 300, 200, { domain: 'D' });
    const member = node('member', 'default', 50, 80, 100, 30, { domain: 'D' });

    const result = scaleDomainContentToFitWidthWithConfig([domain, member], config);

    expect(result.find(item => item.id === 'member')?.style).not.toBe(member.style);
    expect(result.find(item => item.id === 'member')?.measured).not.toBe(member.measured);
    expect(member.position).toEqual({ x: 50, y: 80 });
    expect(member.style).toEqual({ width: 100, height: 30 });
    expect(member.measured).toEqual({ width: 100, height: 30 });
  });

  it('ignores hidden and cross-domain members', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 300, 200, { domain: 'D' });
    const visible = node('visible', 'default', 50, 80, 100, 30, { domain: 'D' });
    const hidden = node('hidden', 'default', 180, 80, 100, 30, {
      domain: 'D',
      hidden: true,
    });
    const other = node('other', 'default', 180, 80, 100, 30, { domain: 'X' });

    const result = scaleDomainContentToFitWidthWithConfig(
      [domain, visible, hidden, other],
      config,
    );

    expect(result.find(item => item.id === 'hidden')?.position.x).toBe(180);
    expect(result.find(item => item.id === 'other')?.position.x).toBe(180);
  });

  it('bounds invalid geometry and handles empty or degenerate content', () => {
    expect(scaleDomainContentToFitWidthWithConfig([], {})).toEqual([]);

    const domain = node(
      'domain',
      'titleGroup',
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      200,
      { domain: 'D' },
    );
    const member = node(
      'member',
      'default',
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      { domain: 'D' },
    );

    const result = scaleDomainContentToFitWidthWithConfig(
      [domain, member],
      {
        domain: {
          padding: { horizontal: Number.POSITIVE_INFINITY },
          sideSafeGap: Number.NEGATIVE_INFINITY,
        },
      },
    );

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(Math.abs(item.position.x)).toBeLessThanOrEqual(100_000);
      expect(Math.abs(item.position.y)).toBeLessThanOrEqual(100_000);
    }
  });
});
