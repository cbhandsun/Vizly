import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  getDomainDagreNodeDimensions,
  getDomainDagreSubDomainOrderIndex,
  normalizeDomainDagreNodes,
  resolveDomainDagreLayoutBoundary,
} from '../domainDagreLayoutBoundary';

describe('domain Dagre layout boundary', () => {
  it('coerces directions, bounded spacing, flags, and semantic order', () => {
    const boundary = resolveDomainDagreLayoutBoundary({
      domain: { gap: -1, widthCompensation: 100 },
      node: { gap: { horizontal: 10, vertical: Number.NaN } },
      diagram: { layout: { direction: 'RL' } },
    }, {
      GROUP_TITLE_SAFE_GAP: Number.POSITIVE_INFINITY,
    }, {
      direction: 'bad',
      subDomainNodeDirection: 'lr',
      nodeLayout: 'vertical',
      domainPlacement: 'ORDERED-LANES',
      generateDomainGroups: 'false',
      domainWhitelist: [' A ', 'A', 1],
      subDomainOrder: { ' Domain A ': [' First ', 'Second'] },
    });

    expect(boundary).toMatchObject({
      domainGap: 0,
      nodeGapH: 40,
      nodeGapV: 60,
      direction: 'RL',
      subDomainNodeDirection: 'LR',
      nodeArrangement: 'vertical',
      domainPlacement: 'ordered-lanes',
      widthCompensation: 10,
      titleSafe: 8,
      showDomainGroups: true,
      domainWhitelist: ['A'],
    });
    expect(getDomainDagreSubDomainOrderIndex(boundary.subDomainOrder, 'domaina', 'first')).toBe(0);
    expect(getDomainDagreSubDomainOrderIndex(boundary.subDomainOrder, 'missing', 'first')).toBe(Infinity);
  });

  it('falls back to topology placement for malformed lane input', () => {
    const boundary = resolveDomainDagreLayoutBoundary({}, {}, {
      domainPlacement: 'grid',
      nodeLayout: '<script>',
    });
    expect(boundary.domainPlacement).toBe('topology');
    expect(boundary.nodeArrangement).toBe('dagre');
  });

  it('applies bounded command spacing only to ordered lane layouts', () => {
    const ordered = resolveDomainDagreLayoutBoundary({}, {}, {
      domainPlacement: 'ordered-lanes',
      spacing: { horizontal: 140, vertical: 130 },
    });
    const topology = resolveDomainDagreLayoutBoundary({}, {}, {
      domainPlacement: 'topology',
      spacing: { horizontal: 140, vertical: 130 },
    });

    expect(ordered).toMatchObject({ nodeGapH: 140, nodeGapV: 130 });
    expect(topology).toMatchObject({ nodeGapH: 100, nodeGapV: 60 });
  });

  it('normalizes each coordinate and dimension independently', () => {
    const nodes = normalizeDomainDagreNodes([{
      id: 'node',
      data: {},
      position: { x: Number.NaN, y: -20 },
      style: { width: 160 },
      measured: { width: 999, height: Number.POSITIVE_INFINITY },
    }], 200, 80);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      position: { x: 0, y: -20 },
      measured: { width: 160, height: 80 },
    });
    expect(getDomainDagreNodeDimensions(nodes[0], 200, 80)).toEqual({ width: 160, height: 80 });
  });

  it('rejects malformed node collections and records', () => {
    expect(normalizeDomainDagreNodes(null, 200, 80)).toEqual([]);
    expect(normalizeDomainDagreNodes([
      null,
      { id: 1, data: {}, position: { x: 0, y: 0 } },
      { id: 'missing-data', position: { x: 0, y: 0 } },
    ], 200, 80)).toEqual([]);
  });

  it('converts hierarchical input to one absolute work space and removes stale runtime geometry', () => {
    const input = [
      { id: 'domain', type: 'titleGroup', position: { x: 100, y: 200 }, data: { domain: 'business' } },
      { id: 'group', type: 'subGroup', parentId: 'domain', position: { x: 20, y: 30 }, data: { subDomain: 'process' } },
      { id: 'leaf', parentId: 'group', extent: 'parent', position: { x: 4, y: 5 },
        positionAbsolute: { x: 9999, y: -9999 }, data: {} },
    ];
    const before = structuredClone(input);
    const nodes = normalizeDomainDagreNodes(input, 200, 80);
    expect(nodes[2].position).toEqual({ x: 124, y: 235 });
    expect(nodes[2].data).toEqual({ domain: 'business', subDomain: 'process' });
    expect(nodes.every(node => !node.parentId && !node.extent && !('positionAbsolute' in node))).toBe(true);
    expect(normalizeDomainDagreNodes(nodes, 200, 80)).toEqual(nodes);
    expect(input).toEqual(before);
  });

  it('bounds extreme input ancestry without trusting inherited object keys', () => {
    const nodes = normalizeDomainDagreNodes([
      { id: '__proto__', parentId: 'b', position: { x: 900000, y: 900000 }, data: {} },
      { id: 'b', type: 'group', position: { x: 900000, y: 900000 }, data: {} },
    ], 200, 80);
    expect(nodes.map(node => node.position)).toEqual([
      { x: 1000000, y: 1000000 }, { x: 900000, y: 900000 },
    ]);
  });

  it('rejects duplicate, cyclic and missing hierarchy references before layout can discard them', () => {
    const node = { id: 'a', position: { x: 0, y: 0 }, data: {} };
    for (const input of [[node, node], [{ ...node, parentId: 'a' }],
      [{ ...node, parentId: 'b' }, { ...node, id: 'b', parentId: 'a' }], [{ ...node, parentId: 'absent' }]]) {
      expect(() => normalizeDomainDagreNodes(input, 200, 80)).toThrow('Invalid input hierarchy for domain layout');
    }
    expect(() => normalizeDomainDagreNodes([node, { ...node, id: 'b', parentId: 'a' }], 200, 80))
      .toThrow('Invalid input hierarchy for domain layout');
  });

  it('accepts exactly twenty parents and rejects deeper chains before clearing hierarchy metadata', () => {
    const chain = (parents: number) => Array.from({ length: parents + 1 }, (_, index) => ({
      id: `node-${index}`, type: index === parents ? 'custom' : 'group', data: {},
      parentId: index ? `node-${index - 1}` : undefined, position: { x: 1, y: 2 },
    }));
    expect(normalizeDomainDagreNodes(chain(20), 200, 80).at(-1)?.position).toEqual({ x: 21, y: 42 });
    for (const depth of [21, 9999]) {
      expect(() => normalizeDomainDagreNodes(chain(depth).reverse(), 200, 80)).toThrow('Invalid input hierarchy for domain layout');
    }
  });

  it('falls back from invalid node dimensions', () => {
    const node = {
      id: 'node', data: {}, position: { x: 0, y: 0 }, width: -1, height: Number.NaN,
    } as Node;
    expect(getDomainDagreNodeDimensions(node, 200, 80)).toEqual({ width: 200, height: 80 });
  });
});
