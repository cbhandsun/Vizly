// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import DomainDagreLayoutStrategy from '../DomainDagreLayoutStrategy';
import { LayoutType } from '../../types/layout';
import { getNodeDimensions } from '../DomainDagreLayoutHelpers';
import { createDomainDagreDirectContent, centerDomainDagreSubGroups } from '../domainDagreDirectContent';
import { evaluateLayoutGeometry } from '../../algorithms/layoutGeometryConstraints';

vi.hoisted(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true, value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
}));
const card = (id: string, subDomain = ''): Node => ({
  id, type: 'default', position: { x: 0, y: 0 }, width: 240, height: 80,
  measured: { width: 240, height: 80 }, style: { width: 240, height: 80 },
  data: { label: id, domain: 'one', subDomain },
});
const absolute = (node: Node, nodes: Node[]): { x: number; y: number } => {
  const parent = nodes.find(value => value.id === node.parentId);
  const offset = parent ? absolute(parent, nodes) : { x: 0, y: 0 };
  return { x: node.position.x + offset.x, y: node.position.y + offset.y };
};
const assertSeparated = (nodes: Node[], leaves: Node[]) => {
  for (let first = 0; first < leaves.length; first++) for (let second = first + 1; second < leaves.length; second++) {
    const a = { ...absolute(leaves[first], nodes), ...getNodeDimensions(leaves[first]) };
    const b = { ...absolute(leaves[second], nodes), ...getNodeDimensions(leaves[second]) };
    expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5
      || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true);
  }
};
const assertGeometry = (nodes: Node[], domainPlacement: string, direction: 'TB' | 'BT' | 'LR' | 'RL') => {
  expect(evaluateLayoutGeometry(nodes, domainPlacement === 'ordered-lanes' ? {
    lanes: { direction, nodeIds: nodes.filter(node => node.type === 'titleGroup' && !node.hidden).map(node => node.id) },
  } : undefined)).toMatchObject({ clean: true, invalidGeometry: 0, invalidHierarchy: 0,
    overlappingPairs: 0, outsideParent: 0, laneViolations: 0, budgetExceeded: false });
};
describe('domain content mode contracts', () => {
  it.each([LayoutType.FLOW, LayoutType.GRID, LayoutType.VERTICAL])('retains %s geometry for direct and subgroup children in both placements', async nodeLayout => {
    for (const direction of ['TB', 'LR', 'BT', 'RL'] as const)
    for (const domainPlacement of ['topology', 'ordered-lanes'] as const) for (const grouped of [false, true]) {
      const nodes = Array.from({ length: 6 }, (_, index) => card(`n${index}`, grouped ? 'nested' : ''));
      const before = structuredClone(nodes);
      const result = await new DomainDagreLayoutStrategy().calculateLayout(nodes, [], {
        type: LayoutType.DAGRE, direction, nodeLayout, domainPlacement,
        generateDomainGroups: true, generateSubDomainGroups: grouped, edgeRoutingQuality: 'interactive',
      });
      const ids = new Set(nodes.map(node => node.id));
      const leaves = result.nodes.filter(node => ids.has(node.id));
      const columns = new Set(leaves.map(node => absolute(node, result.nodes).x)).size;
      const rows = new Set(leaves.map(node => absolute(node, result.nodes).y)).size;
      if (nodeLayout === LayoutType.VERTICAL) { expect(columns).toBe(1); expect(rows).toBe(6); }
      else { expect(columns).toBeGreaterThan(1); expect(rows).toBeGreaterThan(1); }
      assertSeparated(result.nodes, leaves);
      assertGeometry(result.nodes, domainPlacement, direction);
      for (const leaf of leaves) {
        const parent = result.nodes.find(node => node.id === leaf.parentId);
        expect(parent).toBeDefined();
        expect(leaf.position.x).toBeGreaterThanOrEqual(0);
        expect(leaf.position.y).toBeGreaterThanOrEqual(0);
        expect(leaf.position.x + getNodeDimensions(leaf).width).toBeLessThanOrEqual(getNodeDimensions(parent ?? leaf).width + 0.5);
        expect(leaf.position.y + getNodeDimensions(leaf).height).toBeLessThanOrEqual(getNodeDimensions(parent ?? leaf).height + 0.5);
      }
      expect(nodes).toEqual(before);
    }
  });

  it.each(['topology', 'ordered-lanes'] as const)('keeps mixed direct cards and ordered subgroups disjoint in %s', async domainPlacement => {
    for (const direction of ['TB', 'LR', 'BT', 'RL'] as const) {
    const nodes = [...Array.from({ length: 10 }, (_, index) => card(`n${index}`, index < 6 ? '' : index < 8 ? 'first' : 'second')),
      { ...card('other'), data: { domain: 'two', subDomain: '', label: 'other' } }];
    const result = await new DomainDagreLayoutStrategy().calculateLayout(nodes, [], {
      type: LayoutType.DAGRE, direction, nodeLayout: LayoutType.FLOW, domainPlacement,
      generateDomainGroups: true, generateSubDomainGroups: true, edgeRoutingQuality: 'interactive',
    });
    assertSeparated(result.nodes, result.nodes.filter(node => nodes.some(source => source.id === node.id)));
    assertGeometry(result.nodes, domainPlacement, direction);
    if (domainPlacement === 'ordered-lanes') {
      const cross = direction === 'LR' || direction === 'RL' ? 'y' : 'x';
      const domains = result.nodes.filter(node => node.type === 'titleGroup');
      expect(domains.map(node => node.data.domain)).toEqual(['one', 'two']);
      expect(domains[0].position[cross]).toBeLessThan(domains[1].position[cross]);
    }
    for (const direct of result.nodes.filter(node => nodes.slice(0, 6).some(source => source.id === node.id))) {
      assertSeparated(result.nodes, [direct, ...result.nodes.filter(node => node.type === 'subGroup')]);
    }
    }
  });

  it('keeps temporary content identities private and handles empty content', () => {
    expect(createDomainDagreDirectContent([], [], 'flow', false, 40, 30, getNodeDimensions, new Set(), true)).toBeUndefined();
    const cards = [card('__proto__'), card('layout:direct-content')];
    const block = createDomainDagreDirectContent(cards, [], 'flow', false, 40, 30, getNodeDimensions,
      new Set(cards.map(node => node.id)), true);
    expect(block?.block.id).toBe('layout:direct-content:');
    expect(block?.positions.map(position => position.id)).toEqual(cards.map(node => node.id));
    expect(centerDomainDagreSubGroups([], new Map())).toEqual([]);
  });
});
