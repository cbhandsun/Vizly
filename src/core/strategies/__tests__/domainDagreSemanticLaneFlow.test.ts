// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { alignDomainDagreLaneFlow } from '../domainDagreSemanticLaneFlow';
import { connectedLaneInputFingerprint } from '../domainDagreLaneRankDecision';
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
  it('keeps domain-local compact corridors unchanged when global alignment is requested', () => {
    const options = { direction: 'TB' as const, rankMode: 'compact' as const, nodeToSubGroup: membership };
    expect(alignDomainDagreLaneFlow(nodes, edges, { ...options, alignGlobalLanePeers: true }))
      .toEqual(alignDomainDagreLaneFlow(nodes, edges, options));
  });

  it.each(['TB', 'BT', 'LR', 'RL'] as const)('keeps unequal parallel branches on their shared global phase in %s', direction => {
    const input = nodes.map(node => node.id === 'right' ? { ...node, width: 240, height: 120,
      measured: { width: 240, height: 120 }, style: { width: 240, height: 120 } } : node);
    const before = structuredClone(input);
    const arranged = alignDomainDagreLaneFlow(input, edges, {
      direction, rankMode: 'global', alignGlobalLanePeers: true,
      nodeToSubGroup: membership, domainOrder: ['a', 'b'],
    });
    const horizontal = direction === 'LR' || direction === 'RL';
    const flow = horizontal ? 'x' : 'y', size = horizontal ? 'width' : 'height';
    const center = (id: string) => {
      const node = arranged.find(item => item.id === id);
      if (!node) throw Error('Expected parallel phase node');
      return node.position[flow] + getNodeDimensions(node)[size] / 2;
    };
    expect(center('left')).toBe(center('right'));
    const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
    expect(sign * (center('left') - center('start'))).toBeGreaterThan(0);
    expect(sign * (center('end') - center('right'))).toBeGreaterThan(0);
    expect(input).toEqual(before);
  });

  it.each((['TB', 'BT', 'LR', 'RL'] as const).flatMap(direction => [4, 5, 6, 9]
    .map(count => ({ direction, count }))))('reuses space without losing clearance for $count fan-out peers in $direction', ({ direction, count }) => {
    const horizontal = direction === 'LR' || direction === 'RL';
    const cross = horizontal ? 'y' : 'x', flow = horizontal ? 'x' : 'y';
    const children = Array.from({ length: count }, (_, index) => {
      // Descending mixed sizes must retain clearance after center alignment.
      const size = count === 6 ? 140 - index * 12 : count === 9 ? 80 + index * 20 : 80;
      const dimensions = horizontal ? { width: size, height: count === 6 ? 160 : 80 } : { width: 160, height: size };
      return { ...makeNode(`child-${index}`, 'a'), ...dimensions, measured: dimensions, style: dimensions,
        position: horizontal ? { x: 0, y: index * 300 } : { x: index * 300, y: 0 } };
    });
    const graph = [makeNode('domain-a', 'a', 0, 'titleGroup'), makeNode('root', 'a'), ...children];
    const links = children.map(node => ({ id: `root-${node.id}`, source: 'root', target: node.id }));
    const arranged = alignDomainDagreLaneFlow(graph, links, { direction, rankMode: 'compact', horizontalGap: 96, verticalGap: 96 });
    const peers = arranged.filter(node => node.id.startsWith('child-')).sort((a, b) => a.position[flow] - b.position[flow]);
    const columns = new Set(peers.map(node => node.position[cross])).size;
    expect(columns).toBeLessThanOrEqual(count);
    if (count === 4 || count === 5) expect(columns).toBe(count % 2 === 0 ? 2 : 3);
    if (count === 9) expect(columns).toBe(count); // Expensive flow expansion retains the baseline packing.
    else {
      const flowDimension = horizontal ? 'width' : 'height';
      const extent = Math.max(...peers.map(node => node.position[flow] + getNodeDimensions(node)[flowDimension]))
        - Math.min(...peers.map(node => node.position[flow]));
      const serialExtent = peers.reduce((sum, node) => sum + getNodeDimensions(node)[flowDimension], 0) + 48 * (count - 1);
      expect(extent).toBeLessThan(serialExtent);
    }
    // Unequal peers may retain another column. Clearance is a rectangle
    // constraint, not a requirement that every branch use one exact column.
    for (let first = 0; first < peers.length; first++) {
      for (let second = first + 1; second < peers.length; second++) {
        const a = peers[first], b = peers[second];
        const aSize = getNodeDimensions(a), bSize = getNodeDimensions(b);
        const xGap = Math.max(b.position.x - a.position.x - aSize.width, a.position.x - b.position.x - bSize.width);
        const yGap = Math.max(b.position.y - a.position.y - aSize.height, a.position.y - b.position.y - bSize.height);
        expect(Math.max(xGap, yGap)).toBeGreaterThanOrEqual(48);
      }
    }
    expect(graph[2].position).toEqual({ x: 0, y: 0 });
  });
  it.each((['TB', 'BT', 'LR', 'RL'] as const).flatMap(direction => (['grid', 'flow'] as const)
    .map(independentNodeArrangement => ({ direction, independentNodeArrangement }))))('keeps cross-domain process bands while $independentNodeArrangement packs only globally isolated cards in $direction', ({ direction, independentNodeArrangement }) => {
    const cards = Array.from({ length: 6 }, (_, index) => makeNode(`isolated-${index}`, 'a'));
    const process = [makeNode('first', 'a'), makeNode('middle', 'b'), makeNode('last', 'a')];
    const graph = [makeNode('domain-a', 'a', 0, 'titleGroup'), makeNode('domain-b', 'b', 0, 'titleGroup'), ...process, ...cards];
    const crossEdges = [{ id: 'first-middle', source: 'first', target: 'middle' },
      { id: 'middle-last', source: 'middle', target: 'last' }];
    const options = { direction, rankMode: 'global' as const, horizontalGap: 120, verticalGap: 120 };
    const baseline = new Map(alignDomainDagreLaneFlow(graph, crossEdges, options).map(node => [node.id, node]));
    const arranged = alignDomainDagreLaneFlow(graph, crossEdges, { ...options, independentNodeArrangement });
    const byId = new Map(arranged.map(node => [node.id, node]));
    const horizontal = direction === 'LR' || direction === 'RL';
    const flow = horizontal ? 'x' : 'y', flowSize = horizontal ? 'width' : 'height';
    const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
    for (const edge of crossEdges) {
      const difference = (byId.get(edge.target)?.position[flow] ?? NaN) - (byId.get(edge.source)?.position[flow] ?? NaN);
      const original = (baseline.get(edge.target)?.position[flow] ?? NaN) - (baseline.get(edge.source)?.position[flow] ?? NaN);
      expect(difference).toBe(original);
      expect(difference * sign).toBeGreaterThan(0);
    }
    expect(new Set(cards.map(card => byId.get(card.id)?.position.x)).size).toBeGreaterThan(1);
    expect(new Set(cards.map(card => byId.get(card.id)?.position.y)).size).toBeGreaterThan(1);
    expect(byId.get('domain-a')?.[flowSize]).toBe(byId.get('domain-b')?.[flowSize]);
    for (const child of arranged.filter(node => !isDomainDagreGroupNode(node))) {
      const parent = byId.get(`domain-${String(child.data.domain)}`);
      if (!parent) throw Error('missing semantic lane');
      for (const [axis, size] of [['x', 'width'], ['y', 'height']] as const) {
        expect(child.position[axis]).toBeGreaterThanOrEqual(parent.position[axis]);
        expect(child.position[axis] + getNodeDimensions(child)[size]).toBeLessThanOrEqual(parent.position[axis] + getNodeDimensions(parent)[size]);
      }
    }
  });
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

  it.each([
    { direction: 'TB' as const, rankMode: 'global' as const },
    { direction: 'BT' as const, rankMode: 'global' as const },
    { direction: 'LR' as const, rankMode: 'global' as const },
    { direction: 'RL' as const, rankMode: 'global' as const },
    { direction: 'TB' as const, rankMode: 'compact' as const },
    { direction: 'BT' as const, rankMode: 'compact' as const },
    { direction: 'LR' as const, rankMode: 'compact' as const },
    { direction: 'RL' as const, rankMode: 'compact' as const },
  ])('does not serialize a connected peer branch when an isolated peer shares its rank in $rankMode $direction mode', ({ direction, rankMode }) => {
    const domain = makeNode('domain', 'a', 0, 'titleGroup');
    const connected = [makeNode('start', 'a'), makeNode('left', 'a'), makeNode('right', 'a'), makeNode('end', 'a')];
    const branchEdges: Edge[] = [
      { id: 'start-left', source: 'start', target: 'left' },
      { id: 'start-right', source: 'start', target: 'right' },
      { id: 'left-end', source: 'left', target: 'end' },
      { id: 'right-end', source: 'right', target: 'end' },
    ];
    const options = { direction, rankMode };
    const withoutIsolated = alignDomainDagreLaneFlow([domain, ...connected], branchEdges, options);
    const withIsolated = alignDomainDagreLaneFlow([
      domain, ...connected, makeNode('isolated', 'a'),
    ], branchEdges, options);
    const withoutById = new Map(withoutIsolated.map(node => [node.id, node]));
    const withById = new Map(withIsolated.map(node => [node.id, node]));

    expect(connectedLaneInputFingerprint([domain, ...connected], branchEdges, { direction })).toEqual(
      connectedLaneInputFingerprint([domain, ...connected, makeNode('isolated', 'a')], branchEdges, { direction }),
    );

    for (const id of ['start', 'left', 'right', 'end']) {
      expect(withById.get(id)?.position).toEqual(withoutById.get(id)?.position);
    }
    const flow = direction === 'LR' || direction === 'RL' ? 'x' : 'y';
    expect(withById.get('isolated')?.position[flow]).toEqual(withById.get('start')?.position[flow]);
    expect(Math.abs((withById.get('left')?.position[flow] ?? NaN) - (withById.get('right')?.position[flow] ?? NaN))).toBe(120);
  });

  it.each([
    { direction: 'TB' as const, horizontalGap: 180, verticalGap: 36, expectedFlowGap: 36 },
    { direction: 'LR' as const, horizontalGap: 48, verticalGap: 180, expectedFlowGap: 48 },
  ])('honors configured flow-axis density in $direction without changing equal lane extents', ({
    direction,
    horizontalGap,
    verticalGap,
    expectedFlowGap,
  }) => {
    const arranged = alignDomainDagreLaneFlow(nodes, edges, {
      direction,
      nodeToSubGroup: membership,
      domainOrder: ['a', 'b'],
      horizontalGap,
      verticalGap,
    });
    const byId = new Map(arranged.map(node => [node.id, node]));
    const flow = direction === 'LR' ? 'x' : 'y';
    const flowDimension = direction === 'LR' ? 'width' : 'height';

    expect(Math.abs(
      (byId.get('left')?.position[flow] ?? NaN)
      - (byId.get('right')?.position[flow] ?? NaN),
    )).toBe(expectedFlowGap);
    const laneExtents = arranged
      .filter(node => node.type === 'titleGroup')
      .map(node => getNodeDimensions(node)[flowDimension]);
    expect(new Set(laneExtents).size).toBe(1);
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
