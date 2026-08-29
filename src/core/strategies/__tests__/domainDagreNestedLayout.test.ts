import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { buildDomainDagreMembership } from '../domainDagreHierarchy';
import { runDomainDagreNestedLayout } from '../domainDagreNestedLayout';

const dimensions = (node: Node) => ({
  width: Number(node.style?.width ?? node.measured?.width ?? 120),
  height: Number(node.style?.height ?? node.measured?.height ?? 60),
});

const leaf = (id: string, subDomain = ''): Node => ({
  id,
  position: { x: 0, y: 0 },
  style: { width: 120, height: 60 },
  data: { domain: 'operations', subDomain },
});

describe('runDomainDagreNestedLayout', () => {
  it('lays out subgroup children and free nodes inside a sized domain', () => {
    const first = leaf('first', 'inbound');
    const second = leaf('second', 'inbound');
    const free = leaf('free');
    const subGroup: Node = {
      id: 'inbound',
      type: 'subGroup',
      position: { x: 0, y: 0 },
      data: { domain: 'operations', subDomain: 'inbound', children: ['first', 'second'] },
    };
    const domain: Node = {
      id: 'operations',
      type: 'titleGroup',
      position: { x: 500, y: 500 },
      data: { domain: 'operations' },
    };
    const nodes = [domain, subGroup, first, second, free];
    const membership = buildDomainDagreMembership(nodes, [subGroup]);

    runDomainDagreNestedLayout({
      domains: [domain],
      subGroups: [subGroup],
      leafNodes: [first, second, free],
      edges: [{ id: 'inside', source: 'first', target: 'second' }],
      nodeById: new Map(nodes.map(node => [node.id, node])),
      ...membership,
      subDomainOrder: { operations: ['inbound'] },
      subDomainNodeIsHorizontal: false,
      nodeArrangement: 'dagre',
      domainSubGroupIsHorizontal: true,
      packVerticalSubDomains: false,
      nodeGapH: 40,
      nodeGapV: 30,
      subDomainPaddingH: 20,
      subDomainPaddingV: 12,
      subDomainTitleHeight: 24,
      domainPaddingH: 30,
      domainPaddingV: 20,
      domainTitleHeight: 32,
      titleSafetyGap: 8,
      bottomSafetyGap: 10,
      globalBottomSafetyGap: 6,
      widthCompensation: 1,
      getNodeDimensions: dimensions,
    });

    expect(domain.position).toEqual({ x: 0, y: 0 });
    expect(Number(domain.style?.width)).toBeGreaterThan(Number(subGroup.style?.width));
    expect(Number(domain.style?.height)).toBeGreaterThan(Number(subGroup.style?.height));
    expect([first, second, free].every(node => (
      Number.isFinite(node.position.x) && Number.isFinite(node.position.y)
    ))).toBe(true);
  });

  it('honors declared subgroup order in horizontal domain rows', () => {
    const firstChild = leaf('first-child', 'first');
    const secondChild = leaf('second-child', 'second');
    const firstGroup: Node = {
      id: 'first-group', type: 'subGroup', position: { x: 0, y: 0 },
      data: { domain: 'operations', subDomain: 'first', children: ['first-child'] },
    };
    const secondGroup: Node = {
      id: 'second-group', type: 'subGroup', position: { x: 0, y: 0 },
      data: { domain: 'operations', subDomain: 'second', children: ['second-child'] },
    };
    const domain: Node = {
      id: 'operations', type: 'titleGroup', position: { x: 0, y: 0 }, data: { domain: 'operations' },
    };
    const nodes = [domain, secondGroup, firstGroup, firstChild, secondChild];
    const membership = buildDomainDagreMembership(nodes, [secondGroup, firstGroup]);

    runDomainDagreNestedLayout({
      domains: [domain], subGroups: [secondGroup, firstGroup], leafNodes: [firstChild, secondChild],
      edges: [], nodeById: new Map(nodes.map(node => [node.id, node])), ...membership,
      subDomainOrder: { operations: ['first', 'second'] },
      subDomainNodeIsHorizontal: false, nodeArrangement: 'dagre', domainSubGroupIsHorizontal: true,
      packVerticalSubDomains: false,
      nodeGapH: 40, nodeGapV: 30, subDomainPaddingH: 20, subDomainPaddingV: 12,
      subDomainTitleHeight: 24, domainPaddingH: 30, domainPaddingV: 20,
      domainTitleHeight: 32, titleSafetyGap: 8, bottomSafetyGap: 10,
      globalBottomSafetyGap: 6, widthCompensation: 1, getNodeDimensions: dimensions,
    });

    expect(firstGroup.position.x).toBeLessThan(secondGroup.position.x);
    expect(firstGroup.position.y).toBe(secondGroup.position.y);
  });
});
