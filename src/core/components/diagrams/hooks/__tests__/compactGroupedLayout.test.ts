// @vitest-environment jsdom
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { LayoutType, type LayoutOptions } from '../../../../types/layout';
import { canCompareCompactGroups, compactGroupInnerDirection, preferCompactGroupedLayout } from '../compactGroupedLayout';
import type { RoutedLayoutCandidate } from '../layoutCandidateSelection';

const options: LayoutOptions = { type: LayoutType.DAGRE, generateDomainGroups: false, generateSubDomainGroups: true };
const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, width: 60, height: 40, data: { subDomain: 'Group' } },
  { id: 'b', position: { x: 500, y: 0 }, width: 60, height: 40, data: { subDomain: 'Group' } },
];
const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b', className: 'vizly-edge-role-main' }];
const candidate = (x: number): RoutedLayoutCandidate => {
  const geometry = { nodes: [nodes[0], { ...nodes[1], position: { x, y: 0 } }], edges };
  return { geometry, staged: { committedSourceEdges: edges, commitSnapshot: () => true,
    routedEdges: [{ ...edges[0], data: { computedPath: [{ x: 60, y: 20 }, { x, y: 20 }] } }] } };
};

describe('bounded compact group comparison', () => {
  it('accepts semantic groups without using their names or IDs as a policy', () => {
    expect(canCompareCompactGroups(nodes, edges, options)).toBe(true);
    expect(canCompareCompactGroups(nodes.map(node => ({ ...node, data: { subDomain: 'Unseen group' } })), edges, options)).toBe(true);
  });
  it.each([
    { ...options, generateDomainGroups: true },
    { ...options, generateSubDomainGroups: false },
  ])('leaves unsupported hierarchy options to the baseline', opts => {
    expect(canCompareCompactGroups(nodes, edges, opts)).toBe(false);
  });
  it('excludes empty, oversized, nested and authored-path inputs', () => {
    expect(canCompareCompactGroups([], edges, options)).toBe(false);
    expect(canCompareCompactGroups(nodes, [], options)).toBe(false);
    expect(canCompareCompactGroups(Array.from({ length: 65 }, (_, index) => ({ ...nodes[0], id: `n${index}` })), edges, options)).toBe(false);
    expect(canCompareCompactGroups(nodes, Array.from({ length: 129 }, (_, index) => ({ ...edges[0], id: `e${index}` })), options)).toBe(false);
    expect(canCompareCompactGroups([...nodes, { ...nodes[0], id: 'g', type: 'subGroup', parentId: 'parent' }], edges, options)).toBe(false);
    for (const waypoints of [null, 'invalid', [{ x: 20, y: 20 }]]) {
      expect(canCompareCompactGroups(nodes, [{ ...edges[0], data: { waypoints } }], options)).toBe(false);
    }
  });
  it.each(['TB', 'BT', 'LR', 'RL'] as const)('uses the orthogonal child axis for %s', direction => {
    expect(compactGroupInnerDirection(direction)).toBe(direction === 'TB' || direction === 'BT' ? 'LR' : 'TB');
  });
  it('selects a shorter, less elongated complete result and retains ties', () => {
    expect(preferCompactGroupedLayout(candidate(500), candidate(200), 'LR')).toBe(true);
    expect(preferCompactGroupedLayout(candidate(200), candidate(500), 'LR')).toBe(false);
    expect(preferCompactGroupedLayout(candidate(200), candidate(200), 'LR')).toBe(false);
  });
  it('does not mistake missing routes or invalid geometry for improvement', () => {
    const missing = candidate(200);
    missing.staged.routedEdges[0] = edges[0];
    expect(preferCompactGroupedLayout(candidate(500), missing, 'LR')).toBe(false);
    expect(preferCompactGroupedLayout(candidate(500), candidate(Number.NaN), 'LR')).toBe(false);
    expect(preferCompactGroupedLayout(candidate(500), candidate(20), 'LR')).toBe(false);
  });
  it('rejects a shorter layout that reverses an explicit main dependency', () => {
    expect(preferCompactGroupedLayout(candidate(500), candidate(-100), 'LR')).toBe(false);
  });
  it('rejects compact candidates that increase cross-flow drift', () => {
    const before = candidate(500);
    const after = candidate(200);
    after.geometry.nodes[1] = { ...after.geometry.nodes[1], position: { x: 200, y: 120 } };
    after.staged.routedEdges[0] = { ...edges[0], data: { computedPath: [{ x: 60, y: 20 }, { x: 200, y: 20 }] } };
    expect(preferCompactGroupedLayout(before, after, 'LR')).toBe(false);
  });
  it('rejects lost dependencies or changed semantic membership', () => {
    const missingEdge = candidate(200);
    expect(preferCompactGroupedLayout(candidate(500), {
      ...missingEdge, geometry: { ...missingEdge.geometry, edges: [] },
    }, 'LR')).toBe(false);
    expect(preferCompactGroupedLayout(candidate(500), {
      ...missingEdge, geometry: { ...missingEdge.geometry, edges: [{ ...edges[0], className: undefined }] },
    }, 'LR')).toBe(false);
    const changedGroup = candidate(200);
    changedGroup.geometry.nodes[1] = { ...changedGroup.geometry.nodes[1], data: { subDomain: 'Elsewhere' } };
    expect(preferCompactGroupedLayout(candidate(500), changedGroup, 'LR')).toBe(false);
  });
  it('normalizes only a parentless domain alias, preserving real subgroup membership', () => {
    const before = candidate(500), after = candidate(200);
    before.geometry.nodes[0] = { ...before.geometry.nodes[0], data: { domain: 'Domain', subDomain: 'Domain' } };
    after.geometry.nodes[0] = { ...after.geometry.nodes[0], data: { domain: 'Domain' } };
    expect(preferCompactGroupedLayout(before, after, 'LR')).toBe(true);
    before.geometry.nodes[0] = { ...before.geometry.nodes[0], parentId: 'group' };
    expect(preferCompactGroupedLayout(before, after, 'LR')).toBe(false);
  });
});
