import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { buildCommercialPathSearchTerminalCandidates } from '../baseReactFlowDisplayCommercialPathSearch';
import { getExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';

const nodes: Node[] = [
  { id: 'source', position: { x: 100, y: 100 }, width: 100, height: 80, data: {} },
  { id: 'target', position: { x: 600, y: 100 }, width: 100, height: 80, data: {} },
  { id: 'obstacle', position: { x: 350, y: 100 }, width: 100, height: 80, data: {} },
];
const edge: Edge = { id: 'route', source: 'source', target: 'target', sourceHandle: 'right', targetHandle: 'left', data: {
  computedPath: [{ x: 200, y: 140 }, { x: 260, y: 140 }, { x: 260, y: 300 },
    { x: 540, y: 300 }, { x: 540, y: 140 }, { x: 600, y: 140 }],
} };

describe('commercial path search container geometry', () => {
  it.each(['source', 'target'] as const)('rejects reverse overlap in the fixed %s lead', role => {
    const fixed: Edge = { ...edge, data: { ...edge.data, manualHandleSides: ['source', 'target'] } };
    const x = role === 'source' ? 200 : 540;
    const blocker: Edge = { id: 'incoming', source: role === 'target' ? edge.target : 'other',
      target: role === 'source' ? edge.source : 'other',
      data: { computedPath: [{ x: x + 60, y: 140 }, { x, y: 140 }] } };
    expect(buildCommercialPathSearchTerminalCandidates(fixed, nodes, [fixed, blocker])).toEqual([]);
  });

  it.each(['source', 'target'] as const)('rejects unrelated same-direction overlap in the fixed %s lead', role => {
    const fixed: Edge = { ...edge, data: { ...edge.data, manualHandleSides: ['source', 'target'] } };
    const x = role === 'source' ? 200 : 540;
    const blocker: Edge = { id: 'unrelated', source: 'other-source', target: 'other-target',
      data: { computedPath: [{ x, y: 140 }, { x: x + 60, y: 140 }] } };
    expect(buildCommercialPathSearchTerminalCandidates(fixed, nodes, [fixed, blocker])).toEqual([]);
  });

  it.each(['source', 'target'] as const)('preserves a legal same-direction shared %s lead', role => {
    const fixed: Edge = { ...edge, data: { ...edge.data, manualHandleSides: ['source', 'target'] } };
    const x = role === 'source' ? 200 : 540;
    const buddy: Edge = { id: 'buddy', source: role === 'source' ? edge.source : 'other',
      target: role === 'target' ? edge.target : 'other',
      data: { computedPath: [{ x, y: 140 }, { x: x + 60, y: 140 }] } };
    expect(buildCommercialPathSearchTerminalCandidates(fixed, nodes, [fixed, buddy]).length).toBeGreaterThan(0);
  });

  it.each(['source', 'target'])('rejects a crossing in the fixed %s lead before searching the interior', role => {
    const fixed: Edge = { ...edge, data: { ...edge.data, manualHandleSides: ['source', 'target'] } };
    const x = role === 'source' ? 240 : 560;
    const blocker: Edge = { id: 'lead-blocker', source: 'blocker-source', target: 'blocker-target',
      data: { computedPath: [{ x, y: 100 }, { x, y: 180 }] } };
    expect(buildCommercialPathSearchTerminalCandidates(fixed, nodes, [fixed, blocker])).toEqual([]);
  });

  it('resolves nested container coordinates without blocking their interiors', () => {
    const nested: Node[] = [
      { id: 'outer', type: 'domain', position: { x: 20, y: 30 }, width: 900, height: 500, data: {} },
      { id: 'inner', type: 'subDomain', parentId: 'outer', position: { x: 12, y: 18 }, width: 850, height: 450, data: {} },
      ...nodes.map(node => ({ ...node, parentId: 'inner', position: {
        x: node.position.x - 32, y: node.position.y - 48,
      } })),
    ];
    const before = structuredClone(nested);
    expect(buildCommercialPathSearchTerminalCandidates(edge, nested, [edge]))
      .toEqual(buildCommercialPathSearchTerminalCandidates(edge, nodes, [edge]));
    expect(nested).toEqual(before);
  });

  it('retains ordinary business obstacles even when they enclose the terminals', () => {
    const enclosed: Node[] = [...nodes, {
      id: 'solid', position: { x: -1000, y: -1000 }, width: 3000, height: 3000, data: {},
    }];
    expect(buildCommercialPathSearchTerminalCandidates(edge, enclosed, [edge])).toEqual([]);
  });

  it('returns no candidates for empty geometry, missing terminals or missing paths', () => {
    expect(buildCommercialPathSearchTerminalCandidates(edge, [], [edge])).toEqual([]);
    expect(buildCommercialPathSearchTerminalCandidates({ ...edge, target: 'missing' }, nodes, [edge])).toEqual([]);
    expect(buildCommercialPathSearchTerminalCandidates({ ...edge, data: {} }, nodes, [edge])).toEqual([]);
  });

  it('keeps manually fixed sides while finding a safe detour inside a domain', () => {
    const fixed: Edge = { ...edge, data: { ...edge.data, manualHandleSides: ['source', 'target'] } };
    const grouped: Node[] = [...nodes, {
      id: 'container', type: 'domain', position: { x: 0, y: 0 }, width: 900, height: 500, data: {},
    }];
    const candidates = buildCommercialPathSearchTerminalCandidates(fixed, grouped, [fixed]);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.sourceHandle).toBe('right');
      expect(candidate.targetHandle).toBe('left');
      expect(getExactDisplayHardReport([candidate], grouped).hardClean).toBe(true);
    }
    expect(buildCommercialPathSearchTerminalCandidates({ ...fixed, data: {
      ...fixed.data, sourcePortPolicy: 'forbidden',
    } }, grouped, [fixed])).toEqual([]);
  });

  it.each(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])(
    'does not turn the enclosing %s into a solid obstacle', type => {
      const flat = buildCommercialPathSearchTerminalCandidates(edge, nodes, [edge]);
      expect(flat.some(candidate => getExactDisplayHardReport([candidate], nodes).hardClean)).toBe(true);
      const grouped = [...nodes, { id: 'container', type, position: { x: 0, y: 0 }, width: 900, height: 500, data: {} }];
      const before = structuredClone({ edge, grouped });
      const candidates = buildCommercialPathSearchTerminalCandidates(edge, grouped, [edge]);
      expect(candidates).toEqual(flat);
      expect({ edge, grouped }).toEqual(before);
    },
  );
});
