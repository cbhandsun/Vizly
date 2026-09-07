// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { packDisconnectedDagreComponents } from '../domainDagreComponentPacking';
import { domainDagrePeerComponentIndex } from '../domainDagrePeerComponents';

const dimensions = () => ({ width: 200, height: 100 });
const positions = [
  { id: 'start', x: 10, y: 20 }, { id: 'end', x: 10, y: 420 },
  { id: 'one', x: 510, y: 20 }, { id: 'two', x: 810, y: 20 }, { id: 'three', x: 1110, y: 20 },
];
const nodes: Node[] = positions.map(position => ({ id: position.id, position, data: {} }));
const edges: Edge[] = [{ id: 'flow', source: 'start', target: 'end' }];

describe('content-sized domain component packing', () => {
  it('fills empty space beside a tall component while preserving its complete internal geometry', () => {
    const before = structuredClone({ positions, nodes, edges });
    const result = packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, dimensions);
    const byId = new Map(result.map(position => [position.id, position]));
    expect(result.map(position => position.id)).toEqual(positions.map(position => position.id));
    expect(byId.get('start')).toEqual(positions[0]);
    expect(byId.get('end')).toEqual(positions[1]);
    const width = Math.max(...result.map(position => position.x + 200)) - 10;
    const height = Math.max(...result.map(position => position.y + 100)) - 20;
    expect(width).toBe(520);
    expect(height).toBe(500);
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
      const a = result[i], b = result[j];
      expect(Math.abs(a.x - b.x) >= 320 || Math.abs(a.y - b.y) >= 140).toBe(true);
    }
    expect({ positions, nodes, edges }).toEqual(before);
    expect(packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, dimensions)).toEqual(result);
  });

  it('packs the transposed geometry without enlarging either outer dimension', () => {
    const transposed = positions.map(position => ({ ...position, x: position.y, y: position.x }));
    const result = packDisconnectedDagreComponents(transposed, nodes, edges, 40, 120, () => ({ width: 100, height: 200 }));
    expect(Math.max(...result.map(position => position.x + 100)) - 20).toBe(500);
    expect(Math.max(...result.map(position => position.y + 200)) - 10).toBe(520);
  });

  it('preserves a component connected only through leaves outside the local domain', () => {
    const externalEdges = nodes.map(node => ({ source: node.id, target: 'remote' }));
    const componentIndex = domainDagrePeerComponentIndex([...nodes.map(node => node.id), 'remote'], externalEdges);
    expect(packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, dimensions,
      undefined, componentIndex)).toBe(positions);
    expect(packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, dimensions)).not.toBe(positions);
  });

  it('packs genuine isolates around externally linked rigid blocks without changing their relative geometry', () => {
    const componentIndex = domainDagrePeerComponentIndex([...nodes.map(node => node.id), 'remote'], [
      ...edges, { source: 'one', target: 'remote' }, { source: 'remote', target: 'two' },
    ]);
    const result = packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, dimensions,
      undefined, componentIndex);
    expect(result).not.toBe(positions);
    const byId = new Map(result.map(position => [position.id, position]));
    for (const a of positions) for (const b of positions) {
      if (componentIndex.get(a.id) !== componentIndex.get(b.id)) continue;
      expect((byId.get(a.id)?.x ?? NaN) - (byId.get(b.id)?.x ?? NaN)).toBe(a.x - b.x);
      expect((byId.get(a.id)?.y ?? NaN) - (byId.get(b.id)?.y ?? NaN)).toBe(a.y - b.y);
    }
    expect(Math.max(...result.map(position => position.x + 200)) - 10).toBeLessThan(1300);
  });

  it('retains local behavior when the full graph confirms that companion cards are isolated', () => {
    const componentIndex = domainDagrePeerComponentIndex(nodes.map(node => node.id), edges);
    expect(packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, dimensions,
      undefined, componentIndex)).toEqual(packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, dimensions));
  });

  it('preserves Dagre positions when an explicit component projection is incomplete or invalid', () => {
    const valid = domainDagrePeerComponentIndex(nodes.map(node => node.id), edges);
    const incomplete = new Map(valid);
    incomplete.delete('three');
    const invalid = [new Map<string, number>(), incomplete,
      ...[NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]
        .map(value => new Map([...valid, ['remote', value] as const]))];
    for (const componentIndex of invalid) {
      expect(packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, dimensions,
        undefined, componentIndex)).toBe(positions);
    }
  });

  it('rejects a locally smaller area if it lengthens the outer flow', () => {
    const row = positions.slice(0, 3).map((position, index) => ({ ...position, x: index * 320, y: 0 }));
    expect(packDisconnectedDagreComponents(row, nodes.slice(0, 3), [], 120, 40, dimensions)).toBe(row);
  });

  it('uses only a parent-owned free height budget to fold a long strip', () => {
    const row = Array.from({ length: 12 }, (_, index) => ({ id: String(index), x: index * 320, y: 0 }));
    const cards = row.map(position => ({ id: position.id, position, data: {} }));
    const result = packDisconnectedDagreComponents(row, cards, [], 120, 40, dimensions,
      { maxWidth: 3720, maxHeight: 520, objective: 'width' });
    expect(Math.max(...result.map(position => position.x + 200))).toBe(840);
    expect(Math.max(...result.map(position => position.y + 100))).toBe(520);
    expect(packDisconnectedDagreComponents(row, cards, [], 120, 40, dimensions)).toBe(row);
    for (const maxHeight of [NaN, Infinity, -1, 1_000_001]) {
      expect(packDisconnectedDagreComponents(row, cards, [], 120, 40, dimensions,
        { maxWidth: 3720, maxHeight, objective: 'width' })).toBe(row);
    }
  });

  it('leaves connected graphs, cycles and singleton components with Dagre', () => {
    const chain = nodes.slice(1).map((node, index) => ({ id: String(index), source: nodes[index].id, target: node.id }));
    expect(packDisconnectedDagreComponents(positions, nodes, [...chain, { id: 'cycle', source: 'three', target: 'start' }], 120, 40, dimensions)).toBe(positions);
    expect(packDisconnectedDagreComponents([], [], [], 120, 40, dimensions)).toEqual([]);
    const singleton = positions.slice(0, 1);
    expect(packDisconnectedDagreComponents(singleton, nodes.slice(0, 1), [], 120, 40, dimensions)).toBe(singleton);
  });

  it('handles dangling edges and special IDs as data without creating phantom components', () => {
    const special = positions.map((position, index) => ({ ...position, id: index === 2 ? '__proto__' : position.id }));
    const specialNodes = special.map(position => ({ id: position.id, position, data: {} }));
    const result = packDisconnectedDagreComponents(special, specialNodes, [...edges, { id: 'missing', source: '__proto__', target: '<svg onload=alert(1)>' }], 120, 40, dimensions);
    expect(result.map(position => position.id)).toEqual(special.map(position => position.id));
    expect(Math.max(...result.map(position => position.x))).toBe(330);
  });

  it('preserves input on invalid, duplicate, missing and extreme geometry', () => {
    for (const gap of [NaN, Infinity, -1, 5001]) {
      expect(packDisconnectedDagreComponents(positions, nodes, edges, gap, 40, dimensions)).toBe(positions);
    }
    for (const size of [NaN, Infinity, 0, -1, 100001]) {
      expect(packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, () => ({ width: size, height: 100 }))).toBe(positions);
    }
    for (const coordinate of [NaN, Infinity, 1e9]) {
      const invalid = positions.map((position, index) => index ? position : { ...position, x: coordinate });
      expect(packDisconnectedDagreComponents(invalid, nodes, edges, 120, 40, dimensions)).toBe(invalid);
    }
    const duplicate = positions.map(position => ({ ...position, id: 'same' }));
    expect(packDisconnectedDagreComponents(duplicate, nodes, edges, 120, 40, dimensions)).toBe(duplicate);
    expect(packDisconnectedDagreComponents(positions, nodes.slice(1), edges, 120, 40, dimensions)).toBe(positions);
    const missing = positions.map(position => ({ ...position, id: `${position.id}-missing` }));
    expect(packDisconnectedDagreComponents(missing, nodes, edges, 120, 40, dimensions)).toBe(missing);
    const large = Array.from({ length: 257 }, (_, index) => ({ id: String(index), x: index * 320, y: 0 }));
    expect(packDisconnectedDagreComponents(large, large.map(position => ({ id: position.id, position, data: {} })), [], 120, 40, dimensions)).toBe(large);
  });

  it('propagates a dimension resolver failure without mutating graph geometry', () => {
    const before = structuredClone(positions);
    expect(() => packDisconnectedDagreComponents(positions, nodes, edges, 120, 40, () => { throw new Error('measurement failed'); })).toThrow('measurement failed');
    expect(positions).toEqual(before);
  });

  it('indexes long chains iteratively and treats special IDs and dangling endpoints as data', () => {
    const ids = Array.from({ length: 30_000 }, (_, index) => String(index));
    const chain = ids.slice(1).map((target, index) => ({ source: ids[index], target }));
    const componentIndex = domainDagrePeerComponentIndex([...ids, '', '__proto__', '<svg onload=alert(1)>'], [
      ...chain, { source: '__proto__', target: '' }, { source: '', target: ids[0] },
      { source: '<svg onload=alert(1)>', target: 'missing' },
    ]);
    expect(componentIndex.size).toBe(30_003);
    expect(new Set(ids.map(id => componentIndex.get(id))).size).toBe(1);
    expect(componentIndex.get('__proto__')).toBe(componentIndex.get(ids[0]));
    expect(componentIndex.get('')).toBe(componentIndex.get(ids[0]));
    expect(componentIndex.get('<svg onload=alert(1)>')).not.toBe(componentIndex.get(ids[0]));
    expect(componentIndex.has('missing')).toBe(false);
    expect(domainDagrePeerComponentIndex([], chain).size).toBe(0);
  });
});
