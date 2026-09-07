import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { cloneLayoutGeometryConstraints, evaluateLayoutGeometry } from '../layoutGeometryConstraints';
import { createLayoutCandidateAcceptance, layoutCandidateAcceptanceMatches } from '../layoutCandidateAcceptance';

const node = (id: string, x = 0, y = 0): Node => ({
  id, position: { x, y }, width: 100, height: 60, data: {},
});
const container = (id: string, x = 0, y = 0): Node => ({
  ...node(id, x, y), type: 'titleGroup', width: 300, height: 300,
});
const proof = { outputRouteSignature: 'route-v2:1:2:0000000000000000', hardReportDigest: 'hard-report-v1:0000000000000000' };

describe('layout candidate geometry contract', () => {
  it('accepts empty, measured and separated geometry without changing input', () => {
    const nodes = [node('a'), { ...node('b', 160), measured: { width: 110, height: 70 } }];
    const before = structuredClone(nodes);
    expect(evaluateLayoutGeometry([]).clean).toBe(true);
    expect(evaluateLayoutGeometry(nodes).clean).toBe(true);
    expect(nodes).toEqual(before);
    expect(evaluateLayoutGeometry(nodes)).toEqual(evaluateLayoutGeometry(structuredClone(nodes)));
  });

  it.each([null, {}, 'nodes', [null], [{ ...node('a'), position: { x: NaN, y: 0 } }],
    [{ ...node('a'), width: Infinity }], [{ ...node('a'), width: -1 }],
    [{ ...node('a'), measured: { width: 0, height: 60 } }],
    [{ id: 'unmeasured', position: { x: 0, y: 0 }, data: {} }],
    [node('far', 1_000_000_000)],
  ])('rejects malformed or unmeasured visible input: %j', value => {
    expect(evaluateLayoutGeometry(value).clean).toBe(false);
  });

  it('accepts legitimate ancestors and rejects leaf and unrelated-container overlap', () => {
    const group = container('D');
    const child = { ...node('a', 20, 40), parentId: 'D' };
    expect(evaluateLayoutGeometry([group, child]).clean).toBe(true);
    expect(evaluateLayoutGeometry([group, child, { ...child, id: 'b' }]).overlappingPairs).toBe(1);
    expect(evaluateLayoutGeometry([group, container('other', 200)]).overlappingPairs).toBe(1);
    expect(evaluateLayoutGeometry([group, { ...child, parentId: undefined }]).overlappingPairs).toBe(1);
  });

  it('checks containment in true relative-parent coordinates and ignores stale absolute positions', () => {
    const group = container('D', 500, 500);
    const child = { ...node('a', 20, 40), parentId: 'D', positionAbsolute: { x: -900, y: -900 } };
    expect(evaluateLayoutGeometry([group, child]).clean).toBe(true);
    expect(evaluateLayoutGeometry([group, { ...child, position: { x: 250, y: 40 } }]).outsideParent).toBe(1);
    expect(evaluateLayoutGeometry([group, { ...child, position: { x: -10, y: 40 } }]).outsideParent).toBe(1);
  });

  it('rejects duplicate, missing, cyclic and non-container parents', () => {
    for (const nodes of [
      [node('a'), node('a', 200)],
      [{ ...node('a'), parentId: 'missing' }],
      [{ ...container('a'), parentId: 'b' }, { ...container('b'), parentId: 'a' }],
      [node('a'), { ...node('b', 200), parentId: 'a' }],
    ]) expect(evaluateLayoutGeometry(nodes).invalidHierarchy).toBeGreaterThan(0);
  });

  it('excludes hidden descendants and intentional annotations from separation', () => {
    const nodes = [container('D'), { ...node('a'), parentId: 'D' }, { ...node('note'), type: 'sticky-note' }];
    expect(evaluateLayoutGeometry(nodes).clean).toBe(true);
    expect(evaluateLayoutGeometry([{ ...nodes[0], data: { collapsed: true } },
      { ...node('child', 500, 500), parentId: 'D', hidden: true }]).clean).toBe(true);
  });

  it.each([{ hidden: true }, { data: { collapsed: true } }])('checks rendered descendants without inheriting parent visibility: %j', parentState => {
    const nodes = [{ ...container('D'), ...parentState },
      { ...node('a', 20, 40), parentId: 'D' }, { ...node('b', 20, 40), parentId: 'D' }];
    expect(evaluateLayoutGeometry(nodes).overlappingPairs).toBe(1);
    expect(evaluateLayoutGeometry([nodes[0], { ...nodes[1], position: { x: 500, y: 500 } }]).outsideParent).toBe(1);
    expect(evaluateLayoutGeometry([nodes[0], { ...nodes[1], width: undefined }]).invalidGeometry).toBe(1);
    expect(evaluateLayoutGeometry([nodes[0], ...nodes.slice(1).map(child => ({ ...child, hidden: true }))]).clean).toBe(true);
  });

  it.each(['TB', 'BT', 'LR', 'RL'] as const)('binds explicit %s lane alignment, length and membership', direction => {
    const horizontal = direction === 'LR' || direction === 'RL';
    const nodes = [container('a'), container('b', horizontal ? 0 : 400, horizontal ? 400 : 0)];
    const constraints = { lanes: { direction, nodeIds: ['a', 'b'] } };
    expect(evaluateLayoutGeometry(nodes, constraints).clean).toBe(true);
    expect(evaluateLayoutGeometry(nodes, { lanes: { direction, nodeIds: ['b', 'a'] } }).clean).toBe(false);
    const changed = structuredClone(nodes);
    changed[1].position[horizontal ? 'x' : 'y'] += 10;
    expect(evaluateLayoutGeometry(changed, constraints).laneViolations).toBeGreaterThan(0);
    expect(evaluateLayoutGeometry(nodes, { lanes: { direction, nodeIds: ['a', 'missing'] } }).clean).toBe(false);
    expect(evaluateLayoutGeometry(nodes, { lanes: { direction, nodeIds: ['a', 'a'] } }).clean).toBe(false);
  });

  it('fails closed for malformed constraints and excessive candidate work', () => {
    expect(evaluateLayoutGeometry([], { lanes: { direction: 'diagonal', nodeIds: [] } }).clean).toBe(false);
    expect(evaluateLayoutGeometry([], JSON.parse('{"__proto__":{}}')).clean).toBe(false);
    expect(evaluateLayoutGeometry(Array.from({ length: 10_001 }, (_, index) => node(String(index)))).clean).toBe(false);
    const crowdedBand = Array.from({ length: 2002 }, (_, index) => node(String(index), 0, index * 100));
    expect(evaluateLayoutGeometry(crowdedBand).budgetExceeded).toBe(true);
    const deep = Array.from({ length: 22 }, (_, index) => ({ ...container(String(index)), ...(index ? { parentId: String(index - 1) } : {}) }));
    expect(evaluateLayoutGeometry(deep).invalidHierarchy).toBeGreaterThan(0);
  });

  it('preserves original lane membership for direct, nested and hidden members', () => {
    const lanes = [container('A'), container('B', 400)];
    const child = { ...node('child', 20, 40), parentId: 'A' };
    const constraints = { lanes: { direction: 'TB', nodeIds: ['A', 'B'], memberships: [{ nodeId: 'child', laneId: 'A' }] } };
    expect(evaluateLayoutGeometry([...lanes, child], constraints).clean).toBe(true);
    const wrongLane = [...lanes, { ...child, parentId: 'B' }];
    expect(evaluateLayoutGeometry(wrongLane).clean).toBe(true);
    expect(evaluateLayoutGeometry(wrongLane, constraints).laneViolations).toBe(1);
    expect(evaluateLayoutGeometry([...lanes, { ...child, parentId: 'B', hidden: true }], constraints).laneViolations).toBe(1);
    expect(evaluateLayoutGeometry(lanes, constraints).laneViolations).toBe(1);
    const nested = { ...container('sub', 10, 10), type: 'subGroup', parentId: 'A', width: 200, height: 200 };
    expect(evaluateLayoutGeometry([...lanes, nested, { ...child, parentId: 'sub' }], constraints).clean).toBe(true);
  });

  it.each([
    null, {}, [null], [{ nodeId: 'child' }], [{ nodeId: '', laneId: 'A' }],
    [{ nodeId: 1, laneId: 'A' }], [{ nodeId: 'child', laneId: 'missing' }],
    [{ nodeId: 'A', laneId: 'A' }], [{ nodeId: 'child', laneId: 'A', extra: true }],
    [{ nodeId: 'child', laneId: 'A' }, { nodeId: 'child', laneId: 'B' }],
    [{ nodeId: 'x'.repeat(4097), laneId: 'A' }],
  ])('rejects malformed lane ownership declarations: %j', memberships => {
    const constraints = { lanes: { direction: 'TB' as const, nodeIds: ['A', 'B'], memberships } };
    expect(cloneLayoutGeometryConstraints(constraints)).toBeNull();
    expect(evaluateLayoutGeometry([], constraints).clean).toBe(false);
  });

  it('bounds ownership input and deeply freezes the original semantic contract', () => {
    const nodes = [container('A'), container('B', 400), { ...node('child', 20, 40), parentId: 'A' }];
    const memberships = [{ nodeId: 'child', laneId: 'A' }];
    const constraints = { lanes: { direction: 'TB' as const, nodeIds: ['A', 'B'], memberships } };
    const copy = cloneLayoutGeometryConstraints(constraints);
    expect(copy).not.toBeNull();
    expect(Object.isFrozen(copy?.lanes?.memberships)).toBe(true);
    expect(Object.isFrozen(copy?.lanes?.memberships?.[0])).toBe(true);
    const accepted = createLayoutCandidateAcceptance(nodes, constraints, null);
    expect(accepted).not.toBeNull();
    if (!accepted) throw Error('expected membership-bound acceptance');
    memberships[0].laneId = 'B';
    expect(copy?.lanes?.memberships?.[0].laneId).toBe('A');
    expect(layoutCandidateAcceptanceMatches(accepted, nodes, null)).toBe(true);
    expect(layoutCandidateAcceptanceMatches(accepted, [nodes[0], nodes[1], { ...nodes[2], parentId: 'B' }], null)).toBe(false);
    expect(cloneLayoutGeometryConstraints({ lanes: { ...constraints.lanes,
      memberships: Array.from({ length: 10_001 }, (_, index) => ({ nodeId: `child-${index}`, laneId: 'A' })),
    } })).toBeNull();
    expect(cloneLayoutGeometryConstraints({ lanes: { direction: 'TB', nodeIds: [], memberships: [] } })).not.toBeNull();
    expect(cloneLayoutGeometryConstraints(JSON.parse('{"lanes":{"direction":"TB","nodeIds":["A"],"memberships":[{"nodeId":"child","laneId":"A","__proto__":{}}]}}'))).toBeNull();
  });

  it('binds final acceptance to immutable geometry, constraints and original route proof', () => {
    const nodes = [node('a'), node('b', 300)];
    const accepted = createLayoutCandidateAcceptance(nodes, undefined, proof);
    expect(accepted).not.toBeNull();
    if (!accepted) throw Error('expected acceptance');
    expect(layoutCandidateAcceptanceMatches(accepted, nodes, proof)).toBe(true);
    expect(layoutCandidateAcceptanceMatches({ ...accepted }, nodes, proof)).toBe(false);
    expect(layoutCandidateAcceptanceMatches(accepted, nodes, { ...proof, hardReportDigest: 'hard-report-v1:1111111111111111' })).toBe(false);
    const moved = structuredClone(nodes); moved[1].position.x += 1;
    expect(layoutCandidateAcceptanceMatches(accepted, moved, proof)).toBe(false);
    expect(createLayoutCandidateAcceptance([node('a'), node('b')], undefined, proof)).toBeNull();
    const noEdges = createLayoutCandidateAcceptance(nodes, undefined, null);
    expect(noEdges && layoutCandidateAcceptanceMatches(noEdges, nodes, null)).toBe(true);
  });
});
