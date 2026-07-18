import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/config/DiagramConfig', () => ({
  diagramConfigManager: {
    getConfig: () => ({
      diagram: { padding: { left: 40, top: 40 } },
      domain: { padding: { horizontal: 20 }, gap: 30 },
      node: { height: 40 },
    }),
    getLayoutConfig: () => ({
      NODE_H_GAP: 50,
      NODE_V_GAP: 40,
      NODE_MIN_WIDTH: 80,
    }),
  },
}));

import {
  enforceGlobalNoOverlapStrict,
  layoutNodesByGhostDomainColumns,
  resolveAllNodeOverlapsGlobal,
  resolveFreeNodeOverlapsInDomain,
} from '../subGroupGlobalLayout';

const node = (
  id: string,
  x: number,
  y: number,
  options: {
    domain?: string;
    hidden?: boolean;
    type?: string;
    width?: number;
    height?: number;
  } = {},
): ReactFlowNode => ({
  id,
  type: options.type ?? 'default',
  position: { x, y },
  data: {
    domain: options.domain,
    hidden: options.hidden,
  },
  measured: {
    width: options.width ?? 80,
    height: options.height ?? 40,
  },
});

describe('subGroupGlobalLayout', () => {
  it('returns a stable empty result', () => {
    expect(resolveAllNodeOverlapsGlobal([])).toEqual([]);
    expect(layoutNodesByGhostDomainColumns([])).toEqual([]);
    expect(enforceGlobalNoOverlapStrict([], 50, 40)).toEqual([]);
  });

  it('coerces non-finite coordinates before returning early', () => {
    const result = resolveAllNodeOverlapsGlobal([
      node('invalid', Number.NaN, Number.POSITIVE_INFINITY),
    ]);

    expect(result[0].position).toEqual({ x: 0, y: 0 });
  });

  it('separates overlapping business nodes but preserves excluded nodes', () => {
    const result = resolveAllNodeOverlapsGlobal([
      node('first', 0, 0),
      node('second', 0, 0),
      node('hidden', 0, 0, { hidden: true }),
      node('group', 0, 0, { type: 'subGroup' }),
    ]);

    const first = result.find((item) => item.id === 'first')!;
    const second = result.find((item) => item.id === 'second')!;
    expect(Math.abs(second.position.y - first.position.y)).toBeGreaterThanOrEqual(80);
    expect(result.find((item) => item.id === 'hidden')?.position).toEqual({ x: 0, y: 0 });
    expect(result.find((item) => item.id === 'group')?.position).toEqual({ x: 0, y: 0 });
  });

  it('packs distinct domains into ordered ghost columns', () => {
    const result = layoutNodesByGhostDomainColumns([
      node('left-a', 0, 100, { domain: 'left' }),
      node('left-b', 0, 0, { domain: 'left' }),
      node('right-a', 500, 0, { domain: 'right' }),
    ]);
    const leftA = result.find((item) => item.id === 'left-a')!;
    const leftB = result.find((item) => item.id === 'left-b')!;
    const right = result.find((item) => item.id === 'right-a')!;

    expect(leftB.position.y).toBeLessThan(leftA.position.y);
    expect(right.position.x).toBeGreaterThan(leftA.position.x);
  });

  it('bounds extreme iteration input and produces finite non-overlapping output', () => {
    const result = enforceGlobalNoOverlapStrict([
      node('first', Number.NaN, 0),
      node('second', 0, Number.POSITIVE_INFINITY),
      node('third', 0, 0),
    ], Number.NaN, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

    for (const item of result) {
      expect(Number.isFinite(item.position.x)).toBe(true);
      expect(Number.isFinite(item.position.y)).toBe(true);
    }
    expect(new Set(result.map((item) => `${item.position.x}:${item.position.y}`)).size)
      .toBe(result.length);
  });

  it('separates only free nodes within the same domain', () => {
    const child = node('child', 0, 0, { domain: 'domain-a' });
    const subGroup = node('subgroup', 0, 0, {
      domain: 'domain-a',
      type: 'subGroup',
    });
    subGroup.data = {
      domain: 'domain-a',
      children: ['child'],
    };
    const result = resolveFreeNodeOverlapsInDomain([
      child,
      subGroup,
      node('free-a', 0, 0, { domain: 'domain-a' }),
      node('free-b', 0, 0, { domain: 'domain-a' }),
      node('other-domain', 0, 0, { domain: 'domain-b' }),
    ]);

    expect(result.find((item) => item.id === 'child')?.position).toEqual({ x: 0, y: 0 });
    expect(result.find((item) => item.id === 'other-domain')?.position).toEqual({ x: 0, y: 0 });
    const freePositions = result
      .filter((item) => item.id.startsWith('free-'))
      .map((item) => `${item.position.x}:${item.position.y}`);
    expect(new Set(freePositions).size).toBe(2);
  });
});
