// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { chooseLaneRankMode, connectedLaneInputFingerprint, laneRectangleUnionArea, selectDomainDagreLaneFlow } from '../domainDagreLaneRankDecision';
import type { LaneRankMetrics } from '../../types/domainLaneRank';

const fixture = () => {
  const nodes: Node[] = ['ga', 'gb', 'a0', 'a1', 'b0', 'b1'].map((id, index) => ({
    id, type: index < 2 ? 'titleGroup' : 'custom', data: { domain: index === 1 || index > 3 ? 'b' : 'a' },
    position: { x: 0, y: 0 }, width: 160, height: 80,
  }));
  const edges = [{ id: 'one', source: 'a0', target: 'a1' }, { id: 'two', source: 'a1', target: 'b0' }, { id: 'three', source: 'b0', target: 'b1' }];
  return { nodes, edges };
};
const metrics = (flowLength: number, whitespaceRatio = 0.9): LaneRankMetrics => ({ flowLength, whitespaceRatio, backwardTravel: 0, backwardEdgeCount: 0 });

describe('lane rank decisions', () => {
  it.each([-101, -100, 0, 100, 101])('uses an inclusive hysteresis band at score %s', score => {
    for (const previous of ['global', 'compact'] as const) {
      const selected = chooseLaneRankMode({ global: metrics(1000 + score), compact: metrics(1000), margin: 100,
        additionalBacktrackTravel: 0, previous, unchanged: false });
      expect(selected.applied).toBe(score > 100 ? 'compact' : score < -100 ? 'global' : previous);
    }
  });
  it('does not trade increased whitespace for length and preserves unchanged connected semantics', () => {
    const input = { global: metrics(2000), compact: metrics(1000, 0.95), margin: 100, additionalBacktrackTravel: 0, previous: 'compact' as const, unchanged: false };
    expect(chooseLaneRankMode(input).applied).toBe('global');
    expect(chooseLaneRankMode({ ...input, unchanged: true }).reason).toBe('unchanged-connected-flow');
  });
  it('measures rectangle unions, including overlaps and empty input', () => {
    expect(laneRectangleUnionArea([])).toBe(0);
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(laneRectangleUnionArea([a, a, { ...a, x: 5 }])).toBe(150);
    expect(laneRectangleUnionArea([{ ...a, width: 0 }])).toBe(0);
    expect(() => laneRectangleUnionArea([{ ...a, width: NaN }])).toThrow('geometry bounds');
    expect(() => laneRectangleUnionArea([{ ...a, height: -1 }])).toThrow('geometry bounds');
  });
  it.each(['TB', 'BT', 'LR', 'RL'] as const)('returns manual/auto metadata and finite diagnostics in %s', direction => {
    const { nodes, edges } = fixture();
    for (const laneRankPreference of ['global', 'compact', 'auto'] as const) {
      const result = selectDomainDagreLaneFlow(nodes, edges, { direction, laneRankPreference });
      expect(result.decision.requested).toBe(laneRankPreference);
      expect(result.nodes.map(node => node.id)).toEqual(nodes.map(node => node.id));
      expect(Object.keys(result.decision.metrics)).toHaveLength(laneRankPreference === 'auto' ? 2 : 1);
      for (const value of Object.values(result.decision.metrics)) {
        expect(Number.isFinite(value.flowLength)).toBe(true);
        expect(value.whitespaceRatio).toBeGreaterThanOrEqual(0);
        expect(value.whitespaceRatio).toBeLessThanOrEqual(1);
      }
    }
  });
  it('ignores IDs, positions, labels, duplicate relations and isolated nodes in the connected fingerprint', () => {
    const { nodes, edges } = fixture();
    const options = { direction: 'TB' as const };
    const original = connectedLaneInputFingerprint(nodes, edges, options);
    const renamed = new Map(nodes.map((node, index) => [node.id, `${100 - index}`]));
    const copy = nodes.map(node => ({ ...node, id: renamed.get(node.id) ?? '', position: { x: 100, y: 200 }, data: { ...node.data, label: '<svg onload=alert(1)>' } }));
    const links = edges.map(edge => ({ ...edge, source: renamed.get(edge.source) ?? '', target: renamed.get(edge.target) ?? '' }));
    expect(connectedLaneInputFingerprint(copy, links.reverse(), options)).toBe(original);
    const extra = { ...nodes[2], id: 'isolated' };
    expect(connectedLaneInputFingerprint([extra, ...nodes], [...edges, edges[0]], options)).toBe(original);
    expect(connectedLaneInputFingerprint(nodes, edges, { direction: 'LR' })).not.toBe(original);
    expect(connectedLaneInputFingerprint(nodes.map(node => ({ ...node, width: 190 })), edges, options)).not.toBe(original);
    expect(connectedLaneInputFingerprint(nodes, edges, { ...options, verticalGap: 130 })).not.toBe(original);
    expect(connectedLaneInputFingerprint(nodes.map(node => node.id === 'a1' ? { ...node, data: { domain: 'b' } } : node), edges, options)).not.toBe(original);
    const subgroup = { ...nodes[0], id: 'subgroup', type: 'subGroup' };
    expect(connectedLaneInputFingerprint([...nodes, subgroup], edges, { ...options, nodeToSubGroup: new Map([['a1', 'subgroup']]) })).not.toBe(original);
    const first = selectDomainDagreLaneFlow(nodes, edges, options);
    const repeated = selectDomainDagreLaneFlow([extra, ...nodes], edges, { ...options, previousLaneRankDecision: first.decision });
    expect(repeated.decision.applied).toBe(first.decision.applied);
    expect(repeated.decision.reason).toBe('unchanged-connected-flow');
  });
  it('deduplicates ranking and backtrack cost but retains actual edge counts', () => {
    const { nodes, edges } = fixture();
    const once = selectDomainDagreLaneFlow(nodes, edges, { direction: 'TB' });
    const twice = selectDomainDagreLaneFlow(nodes, [...edges, ...edges], { direction: 'TB' });
    expect(twice.nodes).toEqual(once.nodes);
    expect(twice.decision.score).toBe(once.decision.score);
    expect(twice.decision.metrics.compact?.backwardEdgeCount).toBe(2 * (once.decision.metrics.compact?.backwardEdgeCount ?? 0));
  });
  it('does not let shortening an existing feedback trip cancel a new cross-domain backtrack', () => {
    const { nodes, edges } = fixture();
    const decision = selectDomainDagreLaneFlow(nodes, [...edges, { id: 'feedback', source: 'b1', target: 'a0' }], { direction: 'TB' }).decision;
    expect(decision.additionalBacktrackTravel).toBeGreaterThan(0);
    expect((decision.metrics.compact?.backwardTravel ?? NaN) - (decision.metrics.global?.backwardTravel ?? NaN)).toBeLessThan(0);
  });
  it('reports the only geometrically valid auto alternative and never silently changes a manual mode', () => {
    const nodes: Node[] = Array.from({ length: 12 }, (_, index) => [
      { id: `g${index}`, type: 'titleGroup', data: { domain: `d${index}` }, position: { x: 0, y: 0 }, width: 160, height: 80 },
      { id: `n${index}`, type: 'custom', data: { domain: `d${index}` }, position: { x: 0, y: 0 }, width: 160, height: 100_000 },
    ]).flat();
    const edges = Array.from({ length: 11 }, (_, index) => ({ id: `e${index}`, source: `n${index}`, target: `n${index + 1}` }));
    const selected = selectDomainDagreLaneFlow(nodes, edges, { direction: 'TB' });
    expect(selected.decision.applied).toBe('compact');
    expect(selected.decision.reason).toBe('alternative-invalid');
    expect(selected.decision.metrics.global).toBeUndefined();
    expect(() => selectDomainDagreLaneFlow(nodes, edges, { direction: 'TB', laneRankPreference: 'global' })).toThrow('geometry bounds');
  });
  it('handles empty and invalid spacing and rejects invalid geometry atomically', () => {
    expect(selectDomainDagreLaneFlow([], [], { direction: 'TB' }).decision.metrics.global?.flowLength).toBe(0);
    const { nodes, edges } = fixture();
    for (const gap of [NaN, Infinity, -1, 0, 1e30]) {
      expect(Number.isFinite(selectDomainDagreLaneFlow(nodes, edges, { direction: 'TB', verticalGap: gap }).decision.margin)).toBe(true);
    }
    const invalid = nodes.map(node => ({ ...node, position: { x: NaN, y: 0 } }));
    const before = structuredClone(invalid);
    expect(() => selectDomainDagreLaneFlow(invalid, edges, { direction: 'TB' })).toThrow('geometry bounds');
    expect(invalid).toEqual(before);
  });
});
