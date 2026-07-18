import { describe, expect, it } from 'vitest';
import {
  centerSubGroupsInDomainWithConfig,
  expandSubGroupsToDomainWidthWithConfig,
  stackSubGroupsVerticallyWithConfig,
  unifySubGroupLeftAnchorsWithConfig,
} from '../subGroupDomainAlignment';

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
    title: { height: 40, padding: { vertical: 10 }, safeGap: 12 },
  },
  subDomain: { padding: { horizontal: 20 } },
};

describe('subGroupDomainAlignment', () => {
  it('unifies subgroup left anchors and translates children without mutating input', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 360, { domain: 'D' });
    const group = node('group', 'subGroup', 200, 80, 100, 80, {
      domain: 'D',
      children: ['child', 42, 'missing'],
    });
    const child = node('child', 'default', 220, 110, 60, 30, { domain: 'D' });

    const result = unifySubGroupLeftAnchorsWithConfig(
      [domain, group, child],
      {},
      config,
    );

    expect(result.find(item => item.id === 'group')?.position.x).toBe(8);
    expect(result.find(item => item.id === 'child')?.position.x).toBe(28);
    expect(group.position.x).toBe(200);
    expect(child.position.x).toBe(220);
  });

  it('stacks visible subgroups by sequence and keeps their children in lockstep', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 500, { domain: 'D' });
    const second = node('second', 'subGroup', 100, 220, 100, 80, {
      domain: 'D',
      sequence: 2,
      children: ['second-child'],
    });
    const secondChild = node('second-child', 'default', 120, 250, 60, 30);
    const first = node('first', 'subGroup', 100, 120, 100, 80, {
      domain: 'D',
      sequence: 1,
      children: ['first-child'],
    });
    const firstChild = node('first-child', 'default', 120, 150, 60, 30);
    const hidden = node('hidden', 'subGroup', 100, 10, 100, 80, {
      domain: 'D',
      hidden: true,
    });

    const result = stackSubGroupsVerticallyWithConfig(
      [domain, second, secondChild, first, firstChild, hidden],
      { NODE_V_GAP: 40 },
      config,
    );

    expect(result.find(item => item.id === 'first')?.position.y).toBe(62);
    expect(result.find(item => item.id === 'second')?.position.y).toBe(182);
    expect(result.find(item => item.id === 'first-child')?.position.y).toBe(92);
    expect(result.find(item => item.id === 'second-child')?.position.y).toBe(212);
    expect(result.find(item => item.id === 'hidden')?.position.y).toBe(10);
  });

  it('expands subgroup width without sharing mutable style objects with input', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 360, { domain: 'D' });
    const group = node('group', 'subGroup', 140, 120, 100, 80, { domain: 'D' });

    const result = expandSubGroupsToDomainWidthWithConfig(
      [domain, group],
      {},
      config,
    );
    const expanded = result.find(item => item.id === 'group');

    expect(expanded?.position.x).toBe(0);
    expect(expanded?.measured?.width).toBe(460);
    expect(expanded?.style?.width).toBe(460);
    expect(group.style.width).toBe(100);
    expect(group.measured.width).toBe(100);
  });

  it('centers a subgroup collection and translates referenced children', () => {
    const domain = node('domain', 'titleGroup', 0, 0, 500, 360, { domain: 'D' });
    const first = {
      ...node('first', 'subGroup', 40, 80, 100, 80, { children: ['child'] }),
      parentId: 'domain',
    };
    const second = node('second', 'subGroup', 160, 80, 100, 80, { domain: 'D' });
    const child = node('child', 'default', 60, 110, 60, 30);

    const result = centerSubGroupsInDomainWithConfig(
      [domain, first, second, child],
      config,
    );

    expect(result.find(item => item.id === 'first')?.position.x).toBe(140);
    expect(result.find(item => item.id === 'second')?.position.x).toBe(260);
    expect(result.find(item => item.id === 'child')?.position.x).toBe(160);
  });

  it('bounds invalid and extreme geometry and safely handles empty input', () => {
    expect(centerSubGroupsInDomainWithConfig([], {})).toEqual([]);

    const domain = node(
      'domain',
      'titleGroup',
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      100,
      { domain: 'D' },
    );
    const group = node(
      'group',
      'subGroup',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      { domain: 'D', children: ['child'] },
    );
    const child = node(
      'child',
      'default',
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      10,
      10,
    );

    const result = unifySubGroupLeftAnchorsWithConfig(
      [domain, group, child],
      { SUB_GROUP_PADDING: { H: Number.POSITIVE_INFINITY } },
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
