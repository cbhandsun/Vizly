// @vitest-environment jsdom

import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { LayoutType } from '../../types/layout';
import DomainHorizontalLayoutStrategy from '../DomainHorizontalLayoutStrategy';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: String(text ?? '').length * 8 }),
    }),
  });
});

const businessNode = (id: string, subDomain: string): ReactFlowNode => ({
  id,
  type: 'default',
  position: { x: 0, y: 0 },
  measured: { width: 160, height: 72 },
  style: { width: 160, height: 72 },
  data: {
    id,
    description: id,
    domain: 'domain-a',
    subDomain,
  },
});

const dimension = (node: ReactFlowNode, key: 'width' | 'height'): number => Number(
  node.measured?.[key] ?? node.style?.[key] ?? 0,
);

describe('DomainHorizontalLayoutStrategy', () => {
  it('treats malformed runtime collections as empty input', async () => {
    const result = await new DomainHorizontalLayoutStrategy().calculateLayout(
      null as never,
      null as never,
      null as never,
    );

    expect(result).toEqual({ nodes: [], edges: [] });
  });

  it('moves current child instances with their generated subgroup after semantic cloning', async () => {
    const result = await new DomainHorizontalLayoutStrategy().calculateLayout(
      [businessNode('a', '预约（管理）'), businessNode('b', '预约管理')],
      [],
      {
        type: LayoutType.HORIZONTAL,
        nodeLayout: LayoutType.HORIZONTAL,
        generateDomainGroups: true,
        generateSubDomainGroups: true,
        domainOrder: ['domain-a'],
        subDomainOrder: { 'domain-a': ['预约管理'] },
        padding: { top: 80, right: 40, bottom: 40, left: 60 },
        stopAfterPhase: 'phase2',
      } as never,
    );
    const group = result.nodes.find(node => node.type === 'subGroup');
    expect(group).toBeTruthy();
    const children = result.nodes.filter(node => ['a', 'b'].includes(node.id));
    const groupRight = group!.position.x + dimension(group!, 'width');
    const groupBottom = group!.position.y + dimension(group!, 'height');

    expect(new Set(group!.data.children as string[])).toEqual(new Set(['a', 'b']));
    for (const child of children) {
      expect(Number.isFinite(child.position.x)).toBe(true);
      expect(Number.isFinite(child.position.y)).toBe(true);
      expect(child.position.x).toBeGreaterThanOrEqual(group!.position.x);
      expect(child.position.y).toBeGreaterThanOrEqual(group!.position.y);
      expect(child.position.x + dimension(child, 'width')).toBeLessThanOrEqual(groupRight);
      expect(child.position.y + dimension(child, 'height')).toBeLessThanOrEqual(groupBottom);
    }
  }, 15_000);
});
