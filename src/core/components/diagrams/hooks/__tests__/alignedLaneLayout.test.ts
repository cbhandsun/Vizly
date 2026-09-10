// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { LayoutType, type LayoutOptions } from '../../../../types/layout';
import type { LaneRankDecision } from '../../../../types/domainLaneRank';
import type { RoutedLayoutCandidate } from '../layoutCandidateSelection';
import { createAlignedLaneComparison, preferAlignedLaneLayout } from '../alignedLaneLayout';

const calculate = vi.hoisted(() => vi.fn());
vi.mock('../../../../strategies/DomainDagreLayoutStrategy', () => ({
  DomainDagreLayoutStrategy: class { calculateLayout = calculate; },
}));
const nodes: Node[] = [
  { id: 'a', type: 'custom', position: { x: 0, y: 0 }, width: 60, height: 40, data: { domain: 'A' } },
  { id: 'b', type: 'custom', position: { x: 500, y: 0 }, width: 60, height: 40, data: { domain: 'B' } },
];
const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b', className: 'vizly-edge-role-main' }];
const options: LayoutOptions = { type: LayoutType.DAGRE, generateDomainGroups: true,
  generateSubDomainGroups: false, domainPlacement: 'ordered-lanes', laneRankPreference: 'auto' };
const decision: LaneRankDecision = { version: 1, policyVersion: 1, requested: 'auto', applied: 'global',
  reason: 'global-preserved', direction: 'LR', connectedInputFingerprint: 'test', metrics: {} };
const candidate = (x: number): RoutedLayoutCandidate => ({
  geometry: { nodes: [nodes[0], { ...nodes[1], position: { x, y: 0 } }], edges },
  staged: { committedSourceEdges: edges, commitSnapshot: () => true,
    routedEdges: [{ ...edges[0], data: { computedPath: [{ x: 60, y: 20 }, { x, y: 20 }] } }] },
});
const settings = () => ({ nodes, edges, options, direction: 'LR' as const, context: {}, decision,
  onSelectedDecision: vi.fn() });

describe('bounded global lane alignment comparison', () => {
  beforeEach(() => calculate.mockReset());
  it('generates one candidate with the current rank decision and publishes metadata only if selected', async () => {
    const args = settings(), comparison = createAlignedLaneComparison(args);
    const after = candidate(200);
    calculate.mockResolvedValue({ ...after.geometry, metadata: { laneRankDecision: decision } });
    expect(comparison).toBeDefined();
    if (!comparison) throw Error('Expected comparison');
    expect(comparison.prefer(candidate(500), after)).toBe(false);
    await comparison.create();
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(calculate.mock.calls[0]?.[2]).toMatchObject({ alignGlobalLanePeers: true,
      laneRankPreference: 'auto', previousLaneRankDecision: decision });
    expect(args.onSelectedDecision).not.toHaveBeenCalled();
    expect(comparison.prefer(candidate(500), after)).toBe(true);
    expect(args.onSelectedDecision).toHaveBeenCalledWith(decision);
  });
  it('uses routed quality to break an exact semantic-rank tie', async () => {
    const metrics = { flowLength: 500, whitespaceRatio: 0.5, backwardTravel: 0, backwardEdgeCount: 0 };
    const tiedDecision: LaneRankDecision = { ...decision, metrics: { global: metrics, compact: metrics } };
    const args = { ...settings(), decision: tiedDecision };
    const comparison = createAlignedLaneComparison(args);
    if (!comparison) throw Error('Expected comparison');
    calculate.mockResolvedValue({
      ...candidate(200).geometry,
      metadata: { laneRankDecision: { ...tiedDecision, requested: 'compact', applied: 'compact' } },
    });

    await comparison.create();
    expect(calculate.mock.calls[0]?.[2]).toMatchObject({
      laneRankPreference: 'compact', previousLaneRankDecision: tiedDecision,
    });
    expect(comparison.prefer(candidate(500), candidate(200))).toBe(true);
    expect(args.onSelectedDecision).toHaveBeenCalledWith(expect.objectContaining({
      requested: 'auto', applied: 'compact', reason: 'routed-quality', previousApplied: 'global',
    }));
  });
  it('rejects candidates that change the selected rank mode or lose its decision', async () => {
    const args = settings(), comparison = createAlignedLaneComparison(args);
    if (!comparison) throw Error('Expected comparison');
    for (const metadata of [undefined, { laneRankDecision: { ...decision, applied: 'compact' } }]) {
      calculate.mockResolvedValue({ ...candidate(200).geometry, metadata });
      expect(await comparison.create()).toBeNull();
      expect(comparison.prefer(candidate(500), candidate(200))).toBe(false);
    }
    expect(args.onSelectedDecision).not.toHaveBeenCalled();
  });
  it('preserves absent, oversized, authored and non-global inputs', () => {
    const args = settings();
    for (const overrides of [
      { nodes: [] }, { edges: [] },
      { nodes: Array.from({ length: 65 }, (_, index) => ({ ...nodes[0], id: String(index) })) },
      { edges: Array.from({ length: 129 }, (_, index) => ({ ...edges[0], id: String(index) })) },
      { decision: { ...decision, applied: 'compact' as const } },
      { options: { ...options, generateDomainGroups: false } },
      ...[null, 'invalid', [{ x: 1, y: 1 }]].map(waypoints => ({ edges: [{ ...edges[0], data: { waypoints } }] })),
    ]) expect(createAlignedLaneComparison({ ...args, ...overrides })).toBeUndefined();
    expect(calculate).not.toHaveBeenCalled();
  });
  it('requires an improvement and preserves dependency, group and main-flow identity', () => {
    expect(preferAlignedLaneLayout(candidate(500), candidate(200), 'LR')).toBe(true);
    expect(preferAlignedLaneLayout(candidate(200), candidate(200), 'LR')).toBe(false);
    expect(preferAlignedLaneLayout(candidate(200), candidate(500), 'LR')).toBe(false);
    expect(preferAlignedLaneLayout(candidate(500), candidate(-100), 'LR')).toBe(false);
    const changed = candidate(200);
    changed.geometry.nodes[1] = { ...changed.geometry.nodes[1], data: { domain: 'Other' } };
    expect(preferAlignedLaneLayout(candidate(500), changed, 'LR')).toBe(false);
    expect(preferAlignedLaneLayout(candidate(500), { ...candidate(200), geometry: { nodes, edges: [] } }, 'LR')).toBe(false);
  });
  it('rejects aligned candidates that increase cross-flow drift', () => {
    const after = candidate(200);
    after.geometry.nodes[1] = { ...after.geometry.nodes[1], position: { x: 200, y: 120 } };
    after.staged.routedEdges[0] = { ...edges[0], data: { computedPath: [{ x: 60, y: 20 }, { x: 200, y: 20 }] } };
    expect(preferAlignedLaneLayout(candidate(500), after, 'LR')).toBe(false);
  });
  it('keeps source edge labels visible to aligned candidate quality scoring', () => {
    const labelledEdge: Edge = { ...edges[0], data: { label: 'Readable dependency' } };
    const before: RoutedLayoutCandidate = {
      geometry: { nodes: [nodes[0], { ...nodes[1], position: { x: 500, y: 0 } }], edges: [labelledEdge] },
      staged: { committedSourceEdges: [labelledEdge], commitSnapshot: () => true, routedEdges: [
        { ...edges[0], data: { computedPath: [{ x: 60, y: 160 }, { x: 500, y: 160 }] } },
      ] },
    };
    const after: RoutedLayoutCandidate = {
      geometry: { nodes: [nodes[0], { ...nodes[1], position: { x: 200, y: 0 } }], edges: [labelledEdge] },
      staged: { committedSourceEdges: [labelledEdge], commitSnapshot: () => true, routedEdges: [
        { ...edges[0], data: { computedPath: [{ x: 60, y: 20 }, { x: 200, y: 20 }] } },
      ] },
    };
    expect(preferAlignedLaneLayout(before, after, 'LR')).toBe(false);
  });
  it('does not count malformed geometry or absent paths as a better layout', () => {
    expect(preferAlignedLaneLayout(candidate(500), candidate(NaN), 'LR')).toBe(false);
    const incomplete = candidate(200);
    incomplete.staged.routedEdges[0] = edges[0];
    expect(preferAlignedLaneLayout(candidate(500), incomplete, 'LR')).toBe(false);
  });
});
