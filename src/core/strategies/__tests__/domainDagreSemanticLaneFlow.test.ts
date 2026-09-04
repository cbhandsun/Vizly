// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { alignDomainDagreLaneFlow } from '../domainDagreSemanticLaneFlow';
import { getNodeDimensions } from '../DomainDagreLayoutHelpers';
import { isDomainDagreGroupNode } from '../domainDagreHierarchy';

const makeNode = (id: string, domain: string, x = 0, type = 'custom'): Node => ({
  id, type, position: { x, y: 0 }, data: { domain }, width: 160, height: 80,
  measured: { width: 160, height: 80 }, style: { width: 160, height: 80 },
});
const nodes = [
  makeNode('domain-a', 'a', 0, 'titleGroup'), makeNode('domain-b', 'b', 0, 'titleGroup'),
  { ...makeNode('sub-1', 'a', 0, 'subGroup'), data: { domain: 'a', subDomain: 'first' } },
  { ...makeNode('sub-2', 'a', 320, 'subGroup'), data: { domain: 'a', subDomain: 'second' } },
  makeNode('start', 'a'), makeNode('left', 'a'), makeNode('right', 'b', 320), makeNode('end', 'a', 320),
];
const edges: Edge[] = [
  { id: 'sl', source: 'start', target: 'left' }, { id: 'sr', source: 'start', target: 'right' },
  { id: 'le', source: 'left', target: 'end' }, { id: 're', source: 'right', target: 'end' },
];
const membership = new Map([['start', 'sub-1'], ['left', 'sub-1'], ['end', 'sub-2']]);

describe('semantic swimlane process geometry', () => {
  it('keeps differently sized peers inside their lane after cross-domain ordering', () => {
    const wide = { ...makeNode('wide', 'a'), width: 600, measured: { width: 600, height: 80 }, style: { width: 600, height: 80 } };
    const narrow = makeNode('narrow', 'a', 2000);
    const graph = [makeNode('domain', 'a', 0, 'titleGroup'), makeNode('start', 'a'), wide, narrow];
    const result = alignDomainDagreLaneFlow(graph, [
      { id: 'wide-flow', source: 'start', target: 'wide' }, { id: 'narrow-flow', source: 'start', target: 'narrow' },
    ], { direction: 'TB' });
    const domain = result[0];
    for (const node of result.slice(1)) {
      expect(node.position.x).toBeGreaterThanOrEqual(domain.position.x);
      expect(node.position.x + getNodeDimensions(node).width).toBeLessThanOrEqual(domain.position.x + getNodeDimensions(domain).width);
    }
  });
  it.each(['TB', 'BT', 'LR', 'RL'] as const)('preserves all directed dependencies, containment and explicit order in %s', direction => {
    const before = structuredClone(nodes);
    const arranged = alignDomainDagreLaneFlow(nodes, edges, {
      direction, nodeToSubGroup: membership, domainOrder: ['b', 'a'], subDomainOrder: ['second', 'first'],
    });
    const byId = new Map(arranged.map(node => [node.id, node]));
    const horizontal = direction === 'LR' || direction === 'RL';
    const flow = horizontal ? 'x' : 'y';
    const cross = horizontal ? 'y' : 'x';
    const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
    const coordinate = (id: string, axis: 'x' | 'y') => {
      const found = byId.get(id);
      if (!found) throw new Error('Missing arranged node');
      return found.position[axis];
    };
    for (const edge of edges) expect((coordinate(edge.target, flow) - coordinate(edge.source, flow)) * sign).toBeGreaterThan(0);
    expect(coordinate('domain-b', cross)).toBeLessThan(coordinate('domain-a', cross));
    expect(coordinate('sub-2', cross)).toBeLessThan(coordinate('sub-1', cross));
    for (const node of arranged.filter(node => node.type !== 'titleGroup')) {
      const parent = byId.get(membership.get(node.id) ?? `domain-${String(node.data.domain)}`);
      if (!parent) throw new Error('Missing semantic parent');
      const size = getNodeDimensions(node);
      const parentSize = getNodeDimensions(parent);
      expect(node.position.x).toBeGreaterThanOrEqual(parent.position.x);
      expect(node.position.y).toBeGreaterThanOrEqual(parent.position.y);
      expect(node.position.x + size.width).toBeLessThanOrEqual(parent.position.x + parentSize.width);
      expect(node.position.y + size.height).toBeLessThanOrEqual(parent.position.y + parentSize.height);
      if (!isDomainDagreGroupNode(node)) expect(size).toEqual({ width: 160, height: 80 });
    }
    expect(nodes).toEqual(before);
    expect(alignDomainDagreLaneFlow(nodes, edges, {
      direction, nodeToSubGroup: membership, domainOrder: ['b', 'a'], subDomainOrder: ['second', 'first'],
    })).toEqual(arranged);
  });

  it.each(['TB', 'LR'] as const)('compacts empty %s bands while preserving peer corridors and equal lane extents', direction => {
    const arranged = alignDomainDagreLaneFlow(nodes, edges, {
      direction,
      nodeToSubGroup: membership,
      domainOrder: ['a', 'b'],
    });
    const byId = new Map(arranged.map(node => [node.id, node]));
    const flow = direction === 'LR' ? 'x' : 'y';
    const maximumFlowGap = direction === 'LR' ? 96 : 64;

    expect(Math.abs((byId.get('left')?.position[flow] ?? NaN) - (byId.get('right')?.position[flow] ?? NaN))).toBe(120);
    const intervals = arranged.filter(node => !isDomainDagreGroupNode(node)).map(node => ({
      start: node.position[flow],
      end: node.position[flow] + getNodeDimensions(node)[direction === 'LR' ? 'width' : 'height'],
    })).sort((a, b) => a.start - b.start || a.end - b.end);
    let occupiedEnd = intervals[0]?.end ?? 0;
    for (const interval of intervals.slice(1)) {
      if (interval.start > occupiedEnd) expect(interval.start - occupiedEnd).toBeLessThanOrEqual(maximumFlowGap);
      occupiedEnd = Math.max(occupiedEnd, interval.end);
    }
    const domains = arranged.filter(node => node.type === 'titleGroup');
    const flowExtents = domains.map(node => getNodeDimensions(node)[direction === 'LR' ? 'width' : 'height']);
    expect(new Set(flowExtents).size).toBe(1);
  });

  it('handles empty, hidden and ungrouped nodes without losing graph data', () => {
    expect(alignDomainDagreLaneFlow([], [], { direction: 'TB' })).toEqual([]);
    const emptyDomains = nodes.slice(0, 2);
    expect(alignDomainDagreLaneFlow(emptyDomains, [], { direction: 'TB' })).toBe(emptyDomains);
    const ungrouped = [makeNode('ungrouped', '')];
    expect(alignDomainDagreLaneFlow(ungrouped, [], { direction: 'TB' })).toBe(ungrouped);
  });

  it('ignores hidden geometry and discards stale absolute positions when moving visible nodes', () => {
    const hidden = { ...makeNode('hidden', 'a'), hidden: true, position: { x: 9000, y: 8000 } };
    const orphan = makeNode('orphan', '');
    const source = [...nodes, hidden, orphan].map(node => node.hidden ? node : {
      ...node, positionAbsolute: { x: -9999, y: -9999 },
    });
    const arranged = alignDomainDagreLaneFlow(source, edges, { direction: 'LR', nodeToSubGroup: membership });
    expect(arranged.find(node => node.id === 'hidden')).toBe(hidden);
    expect(arranged.map(node => node.id)).toEqual(source.map(node => node.id));
    for (const node of arranged.filter(node => !node.hidden)) expect(node).not.toHaveProperty('positionAbsolute');
    expect(arranged.find(node => node.id === 'orphan')?.position.x).toBeGreaterThanOrEqual(200);
  });

  it('keeps cyclic and missing-endpoint input finite and bounds invalid spacing', () => {
    const cyclic = [...edges, { id: 'feedback', source: 'end', target: 'start' }, { id: 'missing', source: 'missing', target: 'left' }];
    for (const gap of [NaN, Infinity, -10, 0, 1e20]) {
      const arranged = alignDomainDagreLaneFlow(nodes, cyclic, {
        direction: 'TB', nodeToSubGroup: membership, horizontalGap: gap, verticalGap: gap,
      });
      expect(arranged).toHaveLength(nodes.length);
      expect(arranged.every(node => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
    }
  });

  it('treats special semantic identifiers as data, not object keys or markup', () => {
    const special = [makeNode('domain', '__proto__', 0, 'titleGroup'), makeNode('<img onerror=alert(1)>', '__proto__')];
    const arranged = alignDomainDagreLaneFlow(special, [], { direction: 'TB', domainOrder: ['__proto__'] });
    expect(arranged.map(node => node.id)).toEqual(special.map(node => node.id));
    expect(arranged[1].position.x).toBeGreaterThan(arranged[0].position.x);
  });

  it('rejects invalid geometry without partially mutating its input', () => {
    const invalid = nodes.map(node => node.id === 'left' ? { ...node, position: { x: NaN, y: 0 } } : node);
    const before = structuredClone(invalid);
    expect(() => alignDomainDagreLaneFlow(invalid, edges, { direction: 'TB', nodeToSubGroup: membership })).toThrow('geometry bounds');
    expect(invalid).toEqual(before);
  });
});
