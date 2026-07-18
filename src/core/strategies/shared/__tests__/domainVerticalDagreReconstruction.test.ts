import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  centerProjectedDagreSubGroups,
  preprocessDomainVerticalDagreSubGroups,
  reconstructDomainVerticalDagreLayout,
  type DomainVerticalDagreReconstructionConfig,
} from '../domainVerticalDagreReconstruction';

const layoutConfig: DomainVerticalDagreReconstructionConfig = {
  paddingLeft: 40,
  paddingTop: 80,
  domainPaddingHorizontal: 20,
  domainPaddingVertical: 16,
  domainGap: 48,
  subGroupGap: 24,
  domainTitleHeight: 48,
  domainTitlePaddingVertical: 12,
  domainTitleSafeGap: 16,
};

const node = (
  id: string,
  type: string,
  domain: string,
  options: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    data?: Record<string, unknown>;
  } = {},
): ReactFlowNode => ({
  id,
  type,
  position: { x: options.x ?? 0, y: options.y ?? 0 },
  measured: {
    width: options.width ?? 100,
    height: options.height ?? 60,
  },
  style: {
    width: options.width ?? 100,
    height: options.height ?? 60,
  },
  data: {
    domain,
    ...(options.data ?? {}),
  },
});

describe('domainVerticalDagreReconstruction', () => {
  it('preprocesses visible declared children, normalizes direction, and runs safety recovery', () => {
    const reflowSubGroup = vi.fn((
      subGroup: ReactFlowNode,
      children: ReactFlowNode[],
    ) => [
      { ...subGroup, position: { x: 10, y: 20 } },
      ...children.map((child, index) => ({
        ...child,
        position: { x: 100 + index * 100, y: 200 },
      })),
      node('unknown', 'default', 'A'),
    ]);
    const resolveStrict = vi.fn((nodes: ReactFlowNode[]) => nodes);
    const recomputeContainers = vi.fn((nodes: ReactFlowNode[]) => nodes);
    const input = [
      node('sub', 'subGroup', 'A', {
        data: { children: ['child', 'child', 'hidden', '', null, 42] },
      }),
      node('child', 'default', 'A'),
      node('hidden', 'default', 'A', { data: { hidden: true } }),
    ];

    const result = preprocessDomainVerticalDagreSubGroups(input, [], {
      direction: 'lr',
      horizontalGap: 20,
      verticalGap: 10,
      reflowSubGroup,
      resolveStrict,
      recomputeContainers,
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(reflowSubGroup).toHaveBeenCalledWith(
      expect.any(Object),
      [expect.objectContaining({ id: 'child' })],
      20,
      10,
      [],
      'LR',
    );
    expect(byId.get('sub')?.position).toEqual({ x: 10, y: 20 });
    expect(byId.get('child')?.position).toEqual({ x: 100, y: 200 });
    expect(byId.has('unknown')).toBe(false);
    expect(recomputeContainers).toHaveBeenCalledTimes(2);
    expect(resolveStrict).toHaveBeenCalledTimes(1);
    expect(input[0].position).toEqual({ x: 0, y: 0 });
  });

  it('sanitizes gaps and invalid projected coordinates', () => {
    const result = preprocessDomainVerticalDagreSubGroups([
      node('sub', 'subGroup', 'A', { data: { children: ['child'] } }),
      node('child', 'default', 'A', { x: 7, y: 9 }),
    ], [], {
      direction: 'invalid',
      horizontalGap: Number.NaN,
      verticalGap: Number.NEGATIVE_INFINITY,
      reflowSubGroup: (_subGroup, children) => [{
        ...children[0],
        position: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      }],
      resolveStrict: (nodes, horizontalGap, verticalGap) => {
        expect(horizontalGap).toBe(12);
        expect(verticalGap).toBe(8);
        return nodes;
      },
      recomputeContainers: nodes => nodes,
    });

    expect(result[1].position).toEqual({ x: 7, y: 9 });
  });

  it('honors explicit domain order instead of sorting domain names', () => {
    const input = [
      node('domain-a', 'titleGroup', 'A', { width: 600 }),
      node('domain-b', 'titleGroup', 'B', { width: 600 }),
      node('sub-a', 'subGroup', 'A', {
        width: 200,
        height: 120,
        data: { children: [] },
      }),
      node('sub-b', 'subGroup', 'B', {
        width: 200,
        height: 120,
        data: { children: [] },
      }),
    ];

    const result = reconstructDomainVerticalDagreLayout(input, {
      ...layoutConfig,
      domainOrder: ['B', 'A'],
    });
    const byId = new Map(result.map(item => [item.id, item]));

    expect(byId.get('domain-b')?.position.y).toBe(80);
    expect(byId.get('domain-a')!.position.y).toBeGreaterThan(
      byId.get('domain-b')!.position.y,
    );
    expect(input[1].position.y).toBe(0);
    expect(result[1]).not.toBe(input[1]);
  });

  it('top-aligns and horizontally centers dagre-sized subgroups', () => {
    const result = reconstructDomainVerticalDagreLayout([
      node('domain', 'titleGroup', 'D', { width: 600 }),
      node('wide', 'subGroup', 'D', {
        x: 100,
        data: { children: [], __dagreSized: { w: 220, h: 140 } },
      }),
      node('narrow', 'subGroup', 'D', {
        x: 0,
        data: { children: [], __dagreSized: { w: 120, h: 80 } },
      }),
    ], layoutConfig);
    const byId = new Map(result.map(item => [item.id, item]));
    const narrow = byId.get('narrow')!;
    const wide = byId.get('wide')!;

    expect(narrow.position.y).toBe(wide.position.y);
    expect(narrow.position.x).toBe(158);
    expect(wide.position.x).toBe(302);
    expect(narrow.measured).toEqual({ width: 120, height: 80 });
    expect(wide.measured).toEqual({ width: 220, height: 140 });
  });

  it('stacks visible orphan nodes below subgroups and ignores hidden orphans', () => {
    const result = reconstructDomainVerticalDagreLayout([
      node('domain', 'titleGroup', 'D', { width: 500 }),
      node('sub', 'subGroup', 'D', {
        height: 100,
        data: { children: ['child'] },
      }),
      node('child', 'default', 'D'),
      node('orphan-a', 'default', 'D', { height: 50 }),
      node('orphan-b', 'default', 'D', { height: 70 }),
      node('hidden', 'default', 'D', {
        y: 999,
        data: { hidden: true },
      }),
    ], layoutConfig);
    const byId = new Map(result.map(item => [item.id, item]));
    const subgroupBottom = byId.get('sub')!.position.y + 100;

    expect(byId.get('orphan-a')!.position.y).toBe(subgroupBottom + 24);
    expect(byId.get('orphan-b')!.position.y).toBe(
      byId.get('orphan-a')!.position.y + 50 + 24,
    );
    expect(byId.get('hidden')!.position.y).toBe(999);
    expect(byId.get('domain')!.measured!.height).toBeGreaterThan(
      byId.get('orphan-b')!.position.y + 70 - 80,
    );
  });

  it('sanitizes invalid coordinates, dimensions, padding, and gaps', () => {
    const result = reconstructDomainVerticalDagreLayout([
      node('domain', 'titleGroup', 'D', {
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        width: -500,
        height: Number.NaN,
      }),
      node('sub', 'subGroup', 'D', {
        width: Number.POSITIVE_INFINITY,
        height: -10,
        data: {
          children: [],
          __dagreSized: { w: Number.NaN, h: Number.NEGATIVE_INFINITY },
        },
      }),
    ], {
      ...layoutConfig,
      paddingLeft: Number.NaN,
      paddingTop: Number.POSITIVE_INFINITY,
      domainPaddingHorizontal: -20,
      domainPaddingVertical: Number.NaN,
      domainGap: -1,
      subGroupGap: Number.POSITIVE_INFINITY,
    });

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
      expect(item.measured!.width).toBeGreaterThan(0);
      expect(item.measured!.height).toBeGreaterThan(0);
    }
  });

  it('recenters projected subgroups and rigidly moves their children', () => {
    const input = [
      node('domain', 'titleGroup', 'D', { x: 40, width: 800 }),
      node('sub-a', 'subGroup', 'D', {
        x: 60,
        y: 150,
        width: 200,
        data: { children: ['child-a'] },
      }),
      node('sub-b', 'subGroup', 'D', {
        x: 300,
        y: 150,
        width: 100,
        data: { children: ['child-b'] },
      }),
      node('child-a', 'default', 'D', { x: 80, y: 220 }),
      node('child-b', 'default', 'D', { x: 330, y: 220 }),
    ];

    const result = centerProjectedDagreSubGroups(input, {
      domainPaddingHorizontal: 20,
      subGroupGap: 24,
    });
    const byId = new Map(result.map(item => [item.id, item]));
    const expectedStart = 40 + 20 + (760 - 324) / 2;
    const firstDelta = Math.round(expectedStart) - 60;
    const secondX = Math.round(expectedStart + 200 + 24);
    const secondDelta = secondX - 300;

    expect(byId.get('sub-a')!.position.x).toBe(Math.round(expectedStart));
    expect(byId.get('sub-b')!.position.x).toBe(secondX);
    expect(byId.get('child-a')!.position.x).toBe(80 + firstDelta);
    expect(byId.get('child-b')!.position.x).toBe(330 + secondDelta);
    expect(input[1].position.x).toBe(60);
  });

  it('handles empty inputs and domains without subgroups', () => {
    expect(reconstructDomainVerticalDagreLayout([], layoutConfig)).toEqual([]);
    const result = centerProjectedDagreSubGroups(
      [node('domain', 'titleGroup', 'D', { width: 500 })],
      { domainPaddingHorizontal: 20, subGroupGap: 24 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].position).toEqual({ x: 0, y: 0 });
  });
});
