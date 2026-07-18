// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      font: '',
      measureText: (text: string) => ({ width: String(text || '').length * 8 }),
    })),
  });
});

vi.mock('../../../components/config/DiagramConfig', () => ({
  diagramConfigManager: {
    getLayoutConfig: () => ({
      SUB_GROUP_PADDING: { H: 20, V_TOP: 30, V_BOTTOM: 40 },
      NODE_WIDTH: 120,
      NODE_HEIGHT: 60,
    }),
  },
}));

vi.mock('../../../components/layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidth: (text: string) => 80 + String(text || '').length * 5,
      calculateNodeHeight: (text: string) => 40 + Math.ceil(String(text || '').length / 10) * 10,
    }),
  },
}));

vi.mock('../../domainKey', () => ({
  deriveDomainClassFromDomain: (domain: string) => `class-${domain}`,
}));

import {
  applySubGrouping,
  assignChildrenToSubGroups,
  assignChildrenToSubGroupsBySemantic,
  auditAndFixSubGroupChildrenBindings,
  normalizeMissingNodeSubDomainByDomain,
  normalizeSubGroupDomainByChildren,
  purgeSubGroupChildrenBySemantic,
} from '../subGrouping';

const baseNodes = [
  { id: 'n1', position: { x: 100, y: 100 }, measured: { width: 80, height: 40 }, data: { domain: 'D', subDomain: 'S', domainClass: 'wms' } },
  { id: 'n2', position: { x: 220, y: 100 }, measured: { width: 80, height: 40 }, data: { domain: 'D', subDomain: 'S', domainClass: 'wms' } },
  { id: 'n3', position: { x: 100, y: 220 }, measured: { width: 80, height: 40 }, data: { domain: 'D', subDomain: 'Other' } },
];

describe('subGrouping semantic helpers', () => {
  it('creates subgroup containers by domain and subdomain', () => {
    const result = applySubGrouping(baseNodes as never);
    const subgroup = result.find(node => node.type === 'subGroup') as any;

    expect(subgroup.id).toBe('subgroup-D-S');
    expect(subgroup.data.children).toEqual(['n1', 'n2']);
    expect(subgroup.data.domain).toBe('D');
    expect(subgroup.data.domainClass).toBe('wms');
    expect(subgroup.position).toEqual({ x: 80, y: 70 });
    expect(subgroup.style.width).toBe(240);
  });

  it('respects whitelist and marks non-whitelisted subgroups hidden when created', () => {
    const result = applySubGrouping(baseNodes as never, ['S']);

    expect(result.some(node => node.id === 'subgroup-D-S')).toBe(true);
    expect(result.some(node => node.id === 'subgroup-D-Other')).toBe(false);
  });

  it('assigns children to existing subgroups and infers domain/domainClass', () => {
    const nodes = [
      ...baseNodes,
      { id: 'sg', type: 'subGroup', position: { x: 0, y: 0 }, data: { subDomain: 'S' } },
    ];
    const result = assignChildrenToSubGroups(nodes as never);
    const subgroup = result.find(node => node.id === 'sg') as any;

    expect(subgroup.data.children).toEqual(['n1', 'n2']);
    expect(subgroup.data.domain).toBe('D');
    expect(subgroup.data.domainClass).toBe('wms');
  });

  it('assigns, purges, and normalizes semantic children', () => {
    const nodes = [
      ...baseNodes,
      { id: 'virtual-child', position: { x: 0, y: 0 }, data: { domain: 'D' } },
      { id: 'sgS', type: 'subGroup', position: { x: 0, y: 0 }, data: { domain: 'D', subDomain: 'S', children: ['n1', 'n3', 'missing'] } },
      { id: 'virtual', type: 'subGroup', position: { x: 0, y: 0 }, data: { domain: 'D', subDomain: '__virtual__' } },
    ];

    const assigned = assignChildrenToSubGroupsBySemantic(nodes as never);
    expect((assigned.find(node => node.id === 'sgS') as any).data.children).toEqual(['n1', 'n2']);
    expect((assigned.find(node => node.id === 'virtual') as any).data.children).toEqual(['virtual-child']);

    const purged = purgeSubGroupChildrenBySemantic(nodes as never);
    expect((purged.find(node => node.id === 'sgS') as any).data.children).toEqual(['n1']);

    const normalized = normalizeSubGroupDomainByChildren([
      { ...baseNodes[0], data: { domain: 'Major', subDomain: 'S' } },
      { ...baseNodes[1], data: { domain: 'Major', subDomain: 'S' } },
      { id: 'sg', type: 'subGroup', position: { x: 0, y: 0 }, data: { children: ['n1', 'n2'] } },
    ] as never);
    expect((normalized.find(node => node.id === 'sg') as any).data.domain).toBe('Major');
  });

  it('audits subgroup bindings and fills missing node subdomains from domain', () => {
    const audited = auditAndFixSubGroupChildrenBindings([
      { id: 'a', position: { x: 0, y: 0 }, data: { domain: 'D', subDomain: 'S' } },
      { id: 'b', position: { x: 0, y: 0 }, data: { domain: 'D', subDomain: 'S' } },
      { id: 'sg', type: 'subGroup', position: { x: 0, y: 0 }, data: { domain: 'D', subDomain: 'S', children: ['stale'] } },
    ] as never);
    expect((audited.find(node => node.id === 'sg') as any).data.children).toEqual(['a', 'b']);

    const normalized = normalizeMissingNodeSubDomainByDomain([
      { id: 'node', position: { x: 0, y: 0 }, data: { domain: 'D', metadata: {} } },
      { id: 'sg', type: 'subGroup', position: { x: 0, y: 0 }, data: { domain: 'D' } },
    ] as never);
    expect((normalized.find(node => node.id === 'node') as any).data.subDomain).toBe('D');
    expect((normalized.find(node => node.id === 'node') as any).data.metadata.subDomain).toBe('D');
  });
});
