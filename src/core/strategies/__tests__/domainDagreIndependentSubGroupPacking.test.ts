// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { getNodeDimensions } from '../DomainDagreLayoutHelpers';
import { packIndependentDomainDagreSubGroups } from '../domainDagreIndependentSubGroupPacking';

const node = (
  id: string,
  domain: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Node => ({
  id,
  type,
  position: { x, y },
  width,
  height,
  measured: { width, height },
  style: { width, height },
  data: { domain },
});

const transpose = (value: Node): Node => ({
  ...value,
  position: { x: value.position.y, y: value.position.x },
  width: value.height,
  height: value.width,
  measured: { width: Number(value.height), height: Number(value.width) },
  style: { ...value.style, width: value.height, height: value.width },
});

const makeFixture = (horizontal: boolean) => {
  const input = [
    node('domain-a', 'a', 'titleGroup', 0, 0, 1000, 900),
    node('connected-a', 'a', 'subGroup', 40, 100, 380, 180),
    node('connected-b', 'a', 'subGroup', 40, 380, 860, 180),
    node('independent', 'a', 'subGroup', 40, 660, 400, 140),
    node('a', 'a', 'custom', 80, 150, 120, 60),
    node('b', 'a', 'custom', 700, 430, 120, 60),
    node('free', 'a', 'custom', 80, 700, 120, 60),
    node('domain-b', 'b', 'titleGroup', 0, 1020, 1000, 300),
    node('other', 'b', 'custom', 80, 1120, 120, 60),
  ];
  const nodes = horizontal ? input : input.map(transpose);
  const membership = new Map([
    ['a', 'connected-a'],
    ['b', 'connected-b'],
    ['free', 'independent'],
  ]);
  const edges: Edge[] = [{ id: 'a-b', source: 'a', target: 'b' }];
  return { nodes, membership, edges };
};

const options = (horizontal: boolean) => ({
  horizontal,
  flowGap: 40,
  crossGap: 40,
  domainGap: 120,
  flowInsets: { leading: 40, trailing: 40 },
  crossInsets: { leading: 100, trailing: 40 },
});

describe('independent semantic subgroup packing', () => {
  it.each([true, false])('packs disconnected subgroups into free parent space, horizontal=%s', horizontal => {
    const fixture = makeFixture(horizontal);
    const before = structuredClone(fixture.nodes);
    const result = packIndependentDomainDagreSubGroups(
      fixture.nodes,
      fixture.edges,
      fixture.membership,
      options(horizontal),
    );
    const byId = new Map(result.map(value => [value.id, value]));
    const flow = horizontal ? 'x' : 'y';
    const cross = horizontal ? 'y' : 'x';
    const crossDimension = horizontal ? 'height' : 'width';

    expect(byId.get('connected-a')?.position).toEqual(before[1].position);
    expect(byId.get('connected-b')?.position).toEqual(before[2].position);
    expect(byId.get('independent')?.position[flow]).toBe(460);
    expect(byId.get('independent')?.position[cross]).toBe(100);
    expect(byId.get('free')?.position[flow]).toBe(500);
    expect(byId.get('free')?.position[cross]).toBe(140);
    expect(getNodeDimensions(byId.get('domain-a')!)[crossDimension]).toBe(600);
    expect(byId.get('domain-b')?.position[cross]).toBe(720);
    expect(byId.get('other')?.position[cross]).toBe(820);
    expect(fixture.nodes).toEqual(before);
  });

  it('does not move a subgroup that has a boundary edge', () => {
    const fixture = makeFixture(true);
    const result = packIndependentDomainDagreSubGroups(
      fixture.nodes,
      [...fixture.edges, { id: 'free-other', source: 'free', target: 'other' }],
      fixture.membership,
      options(true),
    );
    const byId = new Map(result.map(value => [value.id, value]));
    expect(byId.get('independent')?.position).toEqual(fixture.nodes[3].position);
    expect(getNodeDimensions(byId.get('domain-a')!).height).toBe(840);
  });

  it('fails closed for direct domain content, invalid spacing and non-finite geometry', () => {
    const fixture = makeFixture(true);
    const direct = [...fixture.nodes, node('direct', 'a', 'custom', 600, 700, 120, 60)];
    expect(packIndependentDomainDagreSubGroups(
      direct,
      fixture.edges,
      fixture.membership,
      options(true),
    )).toEqual(direct);
    expect(packIndependentDomainDagreSubGroups(
      fixture.nodes,
      fixture.edges,
      fixture.membership,
      { ...options(true), flowGap: Number.NaN },
    )).toEqual(fixture.nodes);
    const invalid = fixture.nodes.map(value => value.id === 'independent'
      ? { ...value, position: { x: Number.POSITIVE_INFINITY, y: value.position.y } }
      : value);
    expect(packIndependentDomainDagreSubGroups(
      invalid,
      fixture.edges,
      fixture.membership,
      options(true),
    )).toEqual(invalid);
  });

  it('treats hostile-looking identifiers as ordinary data', () => {
    const fixture = makeFixture(true);
    const renamed = fixture.nodes.map(value => value.id === 'independent'
      ? { ...value, id: '<svg onload=alert(1)>' }
      : value.id === 'free' ? { ...value, id: '__proto__' } : value);
    const membership = new Map(fixture.membership);
    membership.delete('free');
    membership.set('__proto__', '<svg onload=alert(1)>');
    const result = packIndependentDomainDagreSubGroups(
      renamed,
      fixture.edges,
      membership,
      options(true),
    );
    expect(result.find(value => value.id === '<svg onload=alert(1)>')?.position).toEqual({ x: 460, y: 100 });
  });
});
