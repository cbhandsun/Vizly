// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import {
  assignDomainDagreLaneCoordinates,
  LANE_LEADING_INSET,
  tightenDomainDagreSubGroupFlowBounds,
} from '../domainDagreLaneCoordinateAssignment';

const node = (id: string, x: number, y: number, width = 240, height = 80): Node => ({
  id, position: { x, y }, width, height, measured: { width, height }, data: {},
});
describe('final swimlane coordinate assignment', () => {
  it.each([false, true])('tightens subgroup presentation bounds around final members, horizontal=%s', horizontal => {
    const flow = horizontal ? 'x' : 'y', flowSize = horizontal ? 'width' : 'height';
    const cross = horizontal ? 'y' : 'x', crossSize = horizontal ? 'height' : 'width';
    const transpose = (value: Node): Node => horizontal ? {
      ...value,
      position: { x: value.position.y, y: value.position.x },
      width: value.height,
      height: value.width,
      measured: { width: Number(value.height), height: Number(value.width) },
    } : value;
    const input = [
      { ...node('domain', 0, 0, 800, 1200), type: 'titleGroup' },
      { ...node('group', 100, 100, 500, 1000), type: 'subGroup' },
      node('first', 180, 300, 180, 80),
      node('second', 180, 600, 180, 100),
      { ...node('empty', 620, 100, 120, 1000), type: 'subGroup' },
    ].map(transpose);
    const before = structuredClone(input);
    const result = tightenDomainDagreSubGroupFlowBounds(
      input,
      new Map([['first', 'group'], ['second', 'group']]),
      horizontal,
      { leading: 80, trailing: 40 },
    );
    const byId = new Map(result.map(value => [value.id, value]));
    expect(byId.get('group')?.position[flow]).toBe(220);
    expect(byId.get('group')?.[flowSize]).toBe(520);
    expect(byId.get('group')?.position[cross]).toBe(before[1].position[cross]);
    expect(byId.get('group')?.[crossSize]).toBe(before[1][crossSize]);
    expect(byId.get('empty')).toEqual(before[4]);
    expect(['first', 'second'].map(id => byId.get(id)?.position)).toEqual([
      before[2].position, before[3].position,
    ]);
    expect(input).toEqual(before);
  });

  it('fails closed for invalid insets and never expands an invalid container', () => {
    const group = { ...node('group', 0, 0, 200, 200), type: 'subGroup' };
    const child = node('child', 0, 300, 100, 80);
    const membership = new Map([['child', 'group']]);
    expect(tightenDomainDagreSubGroupFlowBounds([group, child], membership, false,
      { leading: Number.NaN, trailing: 20 })).toEqual([group, child]);
    expect(tightenDomainDagreSubGroupFlowBounds([group, child], membership, false,
      { leading: 20, trailing: 20 })).toEqual([group, child]);
  });

  it.each([false, true])('keeps same-phase fan-out peers separated when considering a shared channel, horizontal=%s', horizontal => {
    const input = [node('domain', 0, 0, 2000, 1600), node('hub', 500, 200),
      node('a', 0, 800, 200), node('b', 320, 800, 220),
      node('c', 760, 800, 180), node('d', 1100, 800, 240)].map(value => horizontal ? {
      ...value, position: { x: value.position.y, y: value.position.x },
      width: value.height, height: value.width, measured: { width: value.height, height: value.width },
    } : value);
    const before = structuredClone(input);
    const replacements = new Map(input.map(value => [value.id, value]));
    assignDomainDagreLaneCoordinates(replacements, [{ domainId: 'domain', buckets: [{ id: 'domain',
      nodeIds: input.slice(1).map(value => value.id) }] }],
    input.slice(2).map(value => ({ id: `hub-${value.id}`, source: 'hub', target: value.id })), horizontal, 120, 96);
    const peers = input.slice(1).map(value => {
      const result = replacements.get(value.id);
      if (!result) throw Error('Missing fan-out node');
      expect(result.position[horizontal ? 'x' : 'y']).toBe(value.position[horizontal ? 'x' : 'y']);
      return result;
    });
    for (let first = 0; first < peers.length; first++) for (let second = first + 1; second < peers.length; second++) {
      const a = peers[first], b = peers[second];
      expect(Math.max(b.position.x - a.position.x - Number(a.width), a.position.x - b.position.x - Number(b.width),
        b.position.y - a.position.y - Number(a.height), a.position.y - b.position.y - Number(b.height))).toBeGreaterThanOrEqual(48);
    }
    expect(input).toEqual(before);
  });

  it.each([false, true])('applies one inset per actual container, horizontal=%s', horizontal => {
    const cross = horizontal ? 'y' : 'x', size = horizontal ? 'height' : 'width';
    const outerInset = horizontal ? 88 : 32, innerInset = horizontal ? 64 : 32;
    const measure = (nested: boolean) => {
      const input = [node('domain', 0, 0, 1000, 1000), node('group', 0, 0, 900, 900), node('leaf', 0, 200)];
      const values = new Map(input.map(value => [value.id, value]));
      assignDomainDagreLaneCoordinates(values, [{ domainId: 'domain', buckets: [{
        id: nested ? 'group' : 'domain', nodeIds: ['leaf'],
      }] }], [], horizontal, 120, 96);
      const domain = values.get('domain'), group = values.get('group'), leaf = values.get('leaf');
      if (!domain || !group || !leaf) throw new Error('Missing container geometry');
      expect(leaf.position[cross] - domain.position[cross]).toBe(outerInset + (nested ? innerInset : 0));
      expect(domain.position[cross] + Number(domain[size]) - leaf.position[cross] - Number(leaf[size]))
        .toBe(nested ? 64 : 32);
      if (nested) {
        expect(leaf.position[cross] - group.position[cross]).toBe(innerInset);
        expect(group.position[cross] + Number(group[size]) - leaf.position[cross] - Number(leaf[size])).toBe(32);
      }
      return Number(domain[size]);
    };
    expect(measure(true) - measure(false)).toBe(innerInset + 32);
  });
  it('leaves common-channel refinement bounded on oversized edge input', () => {
    const input = [{ ...node('domain', 0, 0, 1000, 1600), type: 'titleGroup' },
      node('hub', 205, 200, 260), node('a', 64, 800, 210), node('b', 394, 800, 212),
      node('c', 104, 960, 191), node('d', 415, 960, 151)];
    const edges = Array.from({ length: 1025 }, (_, i) => ({ id: `e${i}`, source: 'hub', target: ['a', 'b', 'c', 'd'][i % 4] }));
    const replacements = new Map(input.map(value => [value.id, value]));
    assignDomainDagreLaneCoordinates(replacements, [{ domainId: 'domain', buckets: [{ id: 'domain',
      nodeIds: input.slice(1).map(value => value.id) }] }], edges, false, 120, 96);
    const first = replacements.get('a'), second = replacements.get('c');
    if (!first || !second) throw new Error('Missing branch nodes');
    expect(first.position.x + Number(first.width)).not.toBe(second.position.x + Number(second.width));
    expect(replacements.get('hub')?.position.y).toBe(200);
  });
  it.each([false, true])('reserves one common channel across unequal paired rows, horizontal=%s', horizontal => {
    const input = [
      { ...node('domain', 0, 0, 1000, 1600), type: 'titleGroup' },
      node('hub', 205, 200, 260, 96),
      node('left-1', 64, 800, 210), node('right-1', 394, 800, 212),
      node('left-2', 104, 960, 191), node('right-2', 415, 960, 151),
      node('center-last', 240, 1120, 190),
    ].map(value => horizontal ? { ...value, position: { x: value.position.y, y: value.position.x },
      width: value.height, height: value.width, measured: { width: value.height, height: value.width } } : value);
    const before = structuredClone(input);
    const edges = input.slice(2).map(value => ({ id: `e-${value.id}`, source: 'hub', target: value.id }));
    const replacements = new Map(input.map(value => [value.id, value]));
    assignDomainDagreLaneCoordinates(replacements, [{ domainId: 'domain', buckets: [{ id: 'domain',
      nodeIds: input.slice(1).map(value => value.id) }] }], [...edges, ...edges], horizontal, 120, 96);
    const cross = horizontal ? 'y' : 'x', size = horizontal ? 'height' : 'width';
    const get = (id: string) => { const value = replacements.get(id); if (!value) throw new Error('Missing node'); return value; };
    const hub = get('hub'), channel = hub.position[cross] + Number(hub[size]) / 2;
    const leftEnds = ['left-1', 'left-2'].map(id => get(id).position[cross] + Number(get(id)[size]));
    const rightStarts = ['right-1', 'right-2'].map(id => get(id).position[cross]);
    expect(new Set(leftEnds).size).toBe(1);
    expect(new Set(rightStarts).size).toBe(1);
    expect(channel - leftEnds[0]).toBeGreaterThanOrEqual(80);
    expect(rightStarts[0] - channel).toBeGreaterThanOrEqual(80);
    for (const value of input.slice(1)) {
      const output = get(value.id);
      expect(output.position[horizontal ? 'x' : 'y']).toBe(value.position[horizontal ? 'x' : 'y']);
      expect(output.position[cross]).toBeGreaterThanOrEqual(0);
      expect(output.position[cross] + Number(output[size])).toBeLessThanOrEqual(Number(get('domain')[size]));
    }
    expect(input).toEqual(before);
  });
  it.each([false, true])('fills unconnected content using the existing lane extent, horizontal=%s', horizontal => {
    const chain = Array.from({ length: 6 }, (_, index) => node(`c${index}`, 64, 200 + index * 144));
    const isolated = Array.from({ length: 12 }, (_, index) => node(`i${index}`, 424 + index * 360, 200));
    const domain = { ...node('domain', 0, 0, 4688, 1032), type: 'titleGroup' };
    const input = [domain, ...chain, ...isolated].map(value => horizontal ? {
      ...value, position: { x: value.position.y, y: value.position.x },
      width: value.height, height: value.width, measured: { width: value.height, height: value.width },
    } : value);
    const before = structuredClone(input);
    const replacements = new Map(input.map(value => [value.id, value]));
    assignDomainDagreLaneCoordinates(replacements, [{ domainId: 'domain', buckets: [{ id: 'domain',
      nodeIds: [...chain, ...isolated].map(value => value.id) }] }],
    chain.slice(1).map((value, index) => ({ id: `e${index}`, source: chain[index].id, target: value.id })), horizontal, 120, 120);
    const flow = horizontal ? 'x' : 'y';
    const cross = horizontal ? 'y' : 'x';
    const crossSize = horizontal ? 'height' : 'width';
    const flowSize = horizontal ? 'width' : 'height';
    expect(replacements.get('domain')?.[flowSize]).toBe(1032);
    // Horizontal lanes retain their larger title insets.
    expect(replacements.get('domain')?.[crossSize]).toBe(horizontal ? 1440 : 1384);
    for (const value of chain) expect(replacements.get(value.id)?.position[flow]).toBe(value.position.y);
    // The tighter leading inset fits one more isolated card row in the same extent.
    expect(new Set(isolated.map(value => replacements.get(value.id)?.position[flow])).size).toBe(5);
    expect(new Set(isolated.map(value => replacements.get(value.id)?.position[cross])).size).toBe(3);
    expect(input).toEqual(before);
  });

  it('reuses columns after connected peers have received their final flow offsets', () => {
    const leaves = Array.from({ length: 4 }, (_, index) => node(String(index), index * 360, 200 + index * 120, 240, 60));
    const values = new Map([node('domain', 0, 0, 1448, 900), ...leaves].map(value => [value.id, value]));
    assignDomainDagreLaneCoordinates(values, [{ domainId: 'domain', buckets: [{ id: 'domain', nodeIds: leaves.map(value => value.id) }] }],
      leaves.slice(1).map((value, index) => ({ id: `e${index}`, source: leaves[index].id, target: value.id })), false, 120, 120);
    expect(values.get('domain')?.width).toBe(304);
    expect(new Set(leaves.map(value => values.get(value.id)?.position.x)).size).toBe(1);
    expect(leaves.map(value => values.get(value.id)?.position.y)).toEqual(leaves.map(value => value.position.y));
  });

  it('handles empty scopes and treats special IDs as ordinary membership keys', () => {
    const values = new Map([node('__proto__', 0, 0, 600, 600), node('<svg onload=alert(1)>', 0, 200)]
      .map(value => [value.id, value]));
    assignDomainDagreLaneCoordinates(values, [], [], false, 120, 120);
    assignDomainDagreLaneCoordinates(values, [{ domainId: '__proto__', buckets: [{ id: '__proto__', nodeIds: ['<svg onload=alert(1)>'] }] }], [], false, 120, 120);
    expect(values.get('<svg onload=alert(1)>')?.position).toEqual({ x: 32, y: LANE_LEADING_INSET });
  });

  it.each([false, true])('keeps truly independent cards in a uniform grid and grows the common lane envelope, horizontal=%s', horizontal => {
    const cards = Array.from({ length: 6 }, (_, index) => node(`i${index}`, 0, 200));
    const domains = [node('A', 0, 0, 2400, 312), node('B', 2600, 0, 2400, 312)]
      .map(value => ({ ...value, type: 'titleGroup' }));
    const input = [...domains, ...cards].map(value => horizontal ? {
      ...value, position: { x: value.position.y, y: value.position.x },
      width: value.height, height: value.width, measured: { width: value.height, height: value.width },
    } : value);
    const before = structuredClone(input);
    const replacements = new Map(input.map(value => [value.id, value]));
    assignDomainDagreLaneCoordinates(replacements, [
      { domainId: 'A', buckets: [{ id: 'A', nodeIds: cards.map(value => value.id) }] },
      { domainId: 'B', buckets: [] },
    ], [], horizontal, 120, 120, 'grid');
    const flow = horizontal ? 'x' : 'y', flowSize = horizontal ? 'width' : 'height';
    const cross = horizontal ? 'y' : 'x', crossSize = horizontal ? 'height' : 'width';
    const arranged = cards.map(card => replacements.get(card.id));
    expect(new Set(arranged.map(card => card?.position[flow])).size).toBeGreaterThan(1);
    expect(new Set(arranged.map(card => card?.position[cross])).size).toBeGreaterThan(1);
    expect(replacements.get('A')?.[flowSize]).toBe(replacements.get('B')?.[flowSize]);
    expect(replacements.get('A')?.[flowSize]).toBeGreaterThan(312);
    expect(replacements.get('A')?.[crossSize]).toBeLessThan(2400);
    for (const card of arranged) {
      expect((card?.position[flow] ?? Infinity) + (card?.[flowSize] ?? Infinity))
        .toBeLessThanOrEqual(replacements.get('A')?.[flowSize] ?? 0);
    }
    expect(input).toEqual(before);
  });

  it('uses measured Flow rows instead of uniform Grid cells for isolated cards', () => {
    const cards = [node('a', 0, 200, 120, 60), node('b', 0, 200, 180, 80), node('c', 0, 200, 100, 50)];
    const input = [{ ...node('domain', 0, 0, 600, 300), type: 'titleGroup' }, ...cards];
    const arrange = (mode: 'grid' | 'flow') => {
      const result = new Map(input.map(value => [value.id, value]));
      assignDomainDagreLaneCoordinates(result, [{ domainId: 'domain', buckets: [{ id: 'domain', nodeIds: cards.map(value => value.id) }] }],
        [], false, 40, 30, mode);
      return result;
    };
    const grid = arrange('grid'), flow = arrange('flow');
    const distance = (result: Map<string, Node>) => (result.get('b')?.position.x ?? NaN) - (result.get('a')?.position.x ?? NaN);
    expect(distance(grid)).toBe(220);
    expect(distance(flow)).toBe(160);
    expect(flow.get('domain')?.width).toBeLessThan(grid.get('domain')?.width ?? 0);
    expect(flow.get('c')?.position.y).toBeGreaterThan(flow.get('a')?.position.y ?? Infinity);
  });
});
