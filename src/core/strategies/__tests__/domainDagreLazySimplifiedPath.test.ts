// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import { LayoutType } from '../../types/layout';
import { DomainDagreLayoutStrategy } from '../DomainDagreLayoutStrategy';

const { loaded } = vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true, value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
  });
  return { loaded: vi.fn() };
});
vi.mock('../domainDagreSimplifiedPaths', async importOriginal => {
  loaded();
  return importOriginal<typeof import('../domainDagreSimplifiedPaths')>();
});

describe('domain layout lazy simplified path', () => {
  it('does not load the ungrouped route for domains, but still lays out ungrouped input', async () => {
    const strategy = new DomainDagreLayoutStrategy();
    const nodes: Node[] = ['a', 'b'].map(id => ({
      id, position: { x: 0, y: 0 }, data: { label: id, domain: 'operations' },
      style: { width: 160, height: 80 },
    }));
    const edges = [{ id: 'a-b', source: 'a', target: 'b' }];
    const options = { type: LayoutType.DAGRE, direction: 'TB' as const, edgeRoutingQuality: 'interactive' as const };
    const grouped = await strategy.calculateLayout(nodes, edges, options);
    expect(grouped.nodes.some(node => node.type === 'titleGroup' && !node.hidden)).toBe(true);
    expect(loaded).not.toHaveBeenCalled();

    const ungrouped = await strategy.calculateLayout(nodes.map(node => ({ ...node, data: { label: node.id } })), edges, options);
    expect(loaded).toHaveBeenCalledOnce();
    expect(ungrouped.nodes.map(node => node.id).sort()).toEqual(['a', 'b']);
    expect(ungrouped.edges.map(edge => edge.id)).toEqual(['a-b']);
    const source = ungrouped.nodes.find(node => node.id === 'a');
    const target = ungrouped.nodes.find(node => node.id === 'b');
    if (!source || !target) throw new Error('Missing ungrouped leaf');
    expect(target.position.y).toBeGreaterThan(source.position.y);
  });
});
