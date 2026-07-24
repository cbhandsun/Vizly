import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  alignDomainsToLeftAnchor,
  centerVisibleDomainMembersHorizontally,
  compactVisibleSubGroupsRigid,
  separateVisibleSubGroupsHorizontally,
  stackDomainsVerticallyRigid,
  translateDeclaredSubGroupChildrenInPlace,
  translateDomainRigidly,
  translateSubGroupRigidlyInPlace,
} from '../domainVerticalRigidTranslation';

const node = (
  id: string,
  type: string,
  domain: string,
  x: number,
  y: number,
  options: {
    width?: number;
    height?: number;
    data?: Record<string, unknown>;
  } = {},
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: {
    width: options.width ?? 100,
    height: options.height ?? 60,
  },
  style: {
    width: options.width ?? 100,
    height: options.height ?? 60,
  },
  data: { domain, ...(options.data ?? {}) },
});

describe('domainVerticalRigidTranslation', () => {
  it('moves every member of one domain and keeps other domains unchanged', () => {
    const input = [
      node('domain-a', 'titleGroup', 'A', 10, 20, {
        data: { position: { x: 10, y: 20 } },
      }),
      node('sub-a', 'subGroup', 'A', 30, 50),
      node('child-a', 'default', 'A', 40, 80),
      node('domain-b', 'titleGroup', 'B', 100, 200),
    ];

    const result = translateDomainRigidly(input, ' A ', 15, -10);
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('domain-a')?.position).toEqual({ x: 25, y: 10 });
    expect((byId.get('domain-a')?.data as any).position).toEqual({ x: 25, y: 10 });
    expect(byId.get('sub-a')?.position).toEqual({ x: 45, y: 40 });
    expect(byId.get('child-a')?.position).toEqual({ x: 55, y: 70 });
    expect(byId.get('domain-b')?.position).toEqual({ x: 100, y: 200 });
    expect(input[0].position).toEqual({ x: 10, y: 20 });
  });

  it('restacks domains in explicit order and rigidly moves subgroup children and orphans', () => {
    const result = stackDomainsVerticallyRigid([
      node('domain-a', 'titleGroup', 'A', 40, 500, { height: 120 }),
      node('sub-a', 'subGroup', 'A', 80, 560),
      node('child-a', 'default', 'A', 100, 600),
      node('orphan-a', 'default', 'A', 120, 640),
      node('domain-b', 'titleGroup', 'B', 40, 100, { height: 200 }),
      node('sub-b', 'subGroup', 'B', 80, 160),
    ], {
      top: 80,
      gap: 48,
      domainOrder: ['A', 'B'],
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('domain-a')?.position.y).toBe(80);
    expect(byId.get('sub-a')?.position.y).toBe(140);
    expect(byId.get('child-a')?.position.y).toBe(180);
    expect(byId.get('orphan-a')?.position.y).toBe(220);
    expect(byId.get('domain-b')?.position.y).toBe(248);
    expect(byId.get('sub-b')?.position.y).toBe(308);
  });

  it('can preserve current vertical order and only push overlapping domains down', () => {
    const result = stackDomainsVerticallyRigid([
      node('domain-a', 'titleGroup', 'A', 0, 300, { height: 100 }),
      node('child-a', 'default', 'A', 0, 320),
      node('domain-b', 'titleGroup', 'B', 0, 100, { height: 80 }),
      node('child-b', 'default', 'B', 0, 120),
      node('domain-c', 'titleGroup', 'C', 0, 500, { height: 60 }),
    ], {
      top: 80,
      gap: 40,
      sortBy: 'position',
      mode: 'push-down',
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('domain-b')?.position.y).toBe(100);
    expect(byId.get('domain-a')?.position.y).toBe(300);
    expect(byId.get('domain-c')?.position.y).toBe(500);
    expect(byId.get('child-a')?.position.y).toBe(320);
  });

  it('anchors exact stacking at the first ordered domain and marks containers finalized', () => {
    const result = stackDomainsVerticallyRigid([
      node('domain-b', 'titleGroup', 'B', 0, 400, { height: 100 }),
      node('domain-a', 'titleGroup', 'A', 0, 220, { height: 80 }),
    ], {
      gap: 20,
      domainOrder: ['A', 'B'],
      anchor: 'first-current',
      markFinalizedDomains: true,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('domain-a')?.position.y).toBe(220);
    expect(byId.get('domain-b')?.position.y).toBe(320);
    expect((byId.get('domain-a')?.data as any).finalizedDomain).toBe(true);
    expect((byId.get('domain-b')?.data as any).finalizedDomain).toBe(true);
  });

  it('deduplicates alternate domain containers and can exclude hidden domains', () => {
    const result = stackDomainsVerticallyRigid([
      node('group-a', 'group', 'A', 0, 500, { height: 100 }),
      node('title-a', 'titleGroup', 'A', 0, 520, { height: 300 }),
      node('child-a', 'default', 'A', 0, 550),
      node('domain-hidden', 'domain', 'H', 0, 200, {
        height: 100,
        data: { hidden: true },
      }),
      node('child-hidden', 'default', 'H', 0, 230),
      node('domain-b', 'domain', 'B', 0, 800, { height: 60 }),
    ], {
      top: 100,
      gap: 20,
      domainOrder: ['A', 'H', 'B'],
      containerTypes: new Set(['titleGroup', 'domain', 'group']),
      includeHiddenDomains: false,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('group-a')?.position.y).toBe(100);
    expect(byId.get('title-a')?.position.y).toBe(120);
    expect(byId.get('child-a')?.position.y).toBe(150);
    expect(byId.get('domain-b')?.position.y).toBe(220);
    expect(byId.get('domain-hidden')?.position.y).toBe(200);
    expect(byId.get('child-hidden')?.position.y).toBe(230);
  });

  it('left-aligns each domain once and rigidly moves all members', () => {
    const result = alignDomainsToLeftAnchor([
      node('group-a', 'group', 'A', 300, 10),
      node('title-a', 'titleGroup', 'A', 320, 20),
      node('child-a', 'default', 'A', 360, 40),
      node('domain-b', 'domain', 'B', Number.NaN, 100),
      node('child-b', 'default', 'B', 50, 130),
      node('empty', 'titleGroup', '', 999, 200),
    ], {
      left: 80.4,
      containerTypes: new Set(['titleGroup', 'domain', 'group']),
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('group-a')?.position.x).toBe(80);
    expect(byId.get('title-a')?.position.x).toBe(100);
    expect(byId.get('child-a')?.position.x).toBe(140);
    expect(byId.get('domain-b')?.position.x).toBe(80);
    expect(byId.get('child-b')?.position.x).toBe(130);
    expect(byId.get('empty')?.position.x).toBe(999);
  });

  it('centers visible domain members as one projection without moving containers', () => {
    const result = centerVisibleDomainMembersHorizontally([
      node('domain-a', 'titleGroup', 'A', 100, 20, { width: 500 }),
      node('sub-a', 'subGroup', 'A', 140, 80, { width: 100 }),
      node('child-a', 'default', 'A', 260, 100, {
        width: 100,
        data: { position: { x: 260, y: 100 } },
      }),
      node('hidden-a', 'default', 'A', 900, 100, {
        width: 100,
        data: { hidden: true },
      }),
      node('domain-b', 'titleGroup', 'B', 0, 300, { width: 200 }),
      node('wide-b', 'default', 'B', 10, 340, { width: 300 }),
    ], {
      horizontalPadding: 20,
      containerTypes: ['titleGroup'],
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('domain-a')?.position.x).toBe(100);
    expect(byId.get('sub-a')?.position.x).toBe(240);
    expect(byId.get('child-a')?.position.x).toBe(360);
    expect((byId.get('child-a')?.data as any).position.x).toBe(360);
    expect(byId.get('hidden-a')?.position.x).toBe(900);
    expect(byId.get('wide-b')?.position.x).toBe(10);
  });

  it('separates visible subgroups and rigidly moves declared children', () => {
    const result = separateVisibleSubGroupsHorizontally([
      node('domain-a', 'titleGroup', 'A', 100, 20, { width: 600 }),
      node('sub-a1', 'subGroup', 'A', 110, 80, {
        width: 120,
        data: { children: ['child-a1', 'child-a1'] },
      }),
      node('child-a1', 'default', 'A', 130, 100),
      node('sub-a2', 'subGroup', 'A', 180, 80, {
        width: 100,
        data: { children: ['child-a2'] },
      }),
      node('child-a2', 'default', 'A', 200, 100),
      node('hidden-a', 'subGroup', 'A', 160, 200, {
        width: 500,
        data: { hidden: true },
      }),
      node('domain-b', 'titleGroup', 'B', 100, 300, { width: 400 }),
      node('sub-b1', 'subGroup', 'B', 110, 340, { width: 200 }),
      node('sub-b2', 'subGroup', 'B', 120, 340, { width: 200 }),
    ], {
      domainHorizontalPadding: 20,
      firstSubGroupOffset: -10,
      gap: 30,
      fallbackSubGroupWidth: 240,
      domainKeys: [' A ', '', 'missing'],
    });
    const byId = new Map(result.nodes.map(item => [item.id, item]));

    expect(result.movedDomainKeys).toEqual(['A']);
    expect(byId.get('sub-a1')?.position.x).toBe(110);
    expect(byId.get('sub-a2')?.position.x).toBe(260);
    expect(byId.get('child-a2')?.position.x).toBe(280);
    expect(byId.get('child-a1')?.position.x).toBe(130);
    expect(byId.get('hidden-a')?.position.x).toBe(160);
    expect(byId.get('sub-b2')?.position.x).toBe(120);
  });

  it('sanitizes subgroup separation geometry and reports no-op domains', () => {
    const result = separateVisibleSubGroupsHorizontally([
      node('domain', 'titleGroup', 'A', Number.NaN, 0),
      node('sub', 'subGroup', 'A', Number.NEGATIVE_INFINITY, 10, {
        width: Number.NaN,
      }),
      node('empty-domain', 'titleGroup', '', 100, 100),
    ], {
      domainHorizontalPadding: Number.NaN,
      firstSubGroupOffset: Number.POSITIVE_INFINITY,
      gap: -10,
      fallbackSubGroupWidth: Number.NaN,
    });

    expect(result.movedDomainKeys).toEqual([]);
    expect(result.nodes[1].position.x).toBe(0);
    expect(Number.isFinite(result.nodes[1].position.x)).toBe(true);
  });

  it('compacts visible subgroups and moves only their declared children', () => {
    const result = compactVisibleSubGroupsRigid([
      node('sub-a', 'subGroup', 'A', 10, 400, {
        height: 120,
        data: { children: ['child-a'], __dagreSized: { h: 140 } },
      }),
      node('child-a', 'default', 'A', 30, 470),
      node('orphan-a', 'default', 'A', 40, 500),
      node('sub-hidden', 'subGroup', 'B', 10, 100, {
        data: { hidden: true, children: ['child-hidden'] },
      }),
      node('child-hidden', 'default', 'B', 30, 160),
    ], {
      top: 80,
      gap: 48,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('sub-a')?.position.y).toBe(80);
    expect(byId.get('child-a')?.position.y).toBe(150);
    expect(byId.get('orphan-a')?.position.y).toBe(500);
    expect(byId.get('sub-hidden')?.position.y).toBe(100);
    expect(byId.get('child-hidden')?.position.y).toBe(160);
  });

  it('sanitizes invalid coordinates, deltas, heights, top, and gaps', () => {
    const input = [
      node('domain', 'titleGroup', 'A', Number.NaN, Number.POSITIVE_INFINITY, {
        height: -20,
      }),
      node('child', 'default', 'A', Number.NEGATIVE_INFINITY, Number.NaN),
    ];

    const translated = translateDomainRigidly(
      input,
      'A',
      Number.NaN,
      Number.POSITIVE_INFINITY,
    );
    const stacked = stackDomainsVerticallyRigid(translated, {
      top: Number.NaN,
      gap: -20,
    });

    for (const item of stacked) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
    }
    expect(stacked[0].position.y).toBe(80);
  });

  it('handles empty inputs, missing domains, and no-op translation', () => {
    expect(stackDomainsVerticallyRigid([], { top: 0, gap: 0 })).toEqual([]);
    expect(compactVisibleSubGroupsRigid([], { top: 0, gap: 0 })).toEqual([]);

    const input = [node('node', 'default', '', 10, 20)];
    expect(translateDomainRigidly(input, '', 10, 10)[0].position).toEqual({
      x: 10,
      y: 20,
    });
  });

  it('moves a subgroup and each valid declared child exactly once', () => {
    const subGroup = node('sub', 'subGroup', 'A', 10, 20, {
      data: {
        children: ['child', 'child', '', null, 42, 'missing'],
        position: { x: 10, y: 20 },
      },
    });
    const child = node('child', 'default', 'A', 30, 50, {
      data: { hidden: true, position: { x: 30, y: 50 } },
    });
    const nodeById = new Map([
      [subGroup.id, subGroup],
      [child.id, child],
    ]);

    translateSubGroupRigidlyInPlace(nodeById, subGroup, 15, -5);

    expect(subGroup.position).toEqual({ x: 25, y: 15 });
    expect(child.position).toEqual({ x: 45, y: 45 });
    expect((child.data as any).position).toEqual({ x: 45, y: 45 });
  });

  it('can move declared children after an external subgroup relocation', () => {
    const subGroup = node('sub', 'subGroup', 'A', 100, 200, {
      data: { children: ['child'] },
    });
    const child = node('child', 'default', 'A', 130, 250);
    const nodeById = new Map([[child.id, child]]);

    subGroup.position = { x: 160, y: 220 };
    translateDeclaredSubGroupChildrenInPlace(nodeById, subGroup, 60, 20);

    expect(subGroup.position).toEqual({ x: 160, y: 220 });
    expect(child.position).toEqual({ x: 190, y: 270 });
  });

  it('sanitizes non-finite coordinates during a valid in-place translation', () => {
    const subGroup = node(
      'sub',
      'subGroup',
      'A',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      { data: { children: ['child'] } },
    );
    const child = node(
      'child',
      'default',
      'A',
      Number.NEGATIVE_INFINITY,
      Number.NaN,
    );

    translateSubGroupRigidlyInPlace(
      new Map([[child.id, child]]),
      subGroup,
      10,
      20,
    );

    expect(subGroup.position).toEqual({ x: 10, y: 20 });
    expect(child.position).toEqual({ x: 10, y: 20 });
  });
});
