// @vitest-environment jsdom
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { evaluateLayoutGeometry } from '../../algorithms/layoutGeometryConstraints';
import { auditBaseReactFlowDisplayCommercialQuality } from '../../components/shared/baseReactFlowDisplayCommercialQuality';
import { projectBaseReactFlowDisplayWorkerInput } from '../../components/shared/baseReactFlowDisplayWorkerProjection';
import { measureRoutedLayoutQuality, routedLayoutDominates, type RoutedLayoutQuality } from '../../components/shared/routedLayoutQuality';
import { LayoutType } from '../../types/layout';
import { DomainDagreLayoutStrategy } from '../DomainDagreLayoutStrategy';

vi.hoisted(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
}));

type NodeSpec = Readonly<{ id: string; domain: string; subDomain?: string }>;
type CorpusCase = Readonly<{ id: string; nodes: Node[]; edges: Edge[] }>;

const nodes = (specs: readonly NodeSpec[]): Node[] => specs.map((spec, index) => ({
  id: spec.id,
  type: 'custom',
  position: { x: index * 10, y: 0 },
  data: { domain: spec.domain, subDomain: spec.subDomain, description: spec.id },
  width: 180,
  height: 80,
  measured: { width: 180, height: 80 },
}));

const edges = (pairs: readonly (readonly [string, string])[], fixed = false): Edge[] =>
  pairs.map(([source, target], index) => ({
    id: `edge-${index}`,
    source,
    target,
    ...(fixed ? {
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { sourceHandleLocked: true, targetHandleLocked: true },
    } : {}),
  }));

const corpus: readonly CorpusCase[] = [
  {
    id: 'sparse-chain',
    nodes: nodes(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((id, index) => ({
      id, domain: String.fromCharCode(65 + Math.floor(index / 2)),
    }))),
    edges: edges([['a1', 'a2'], ['a2', 'b1'], ['b1', 'b2'], ['b2', 'c1'], ['c1', 'c2']]),
  },
  {
    id: 'dense-fan',
    nodes: nodes(['source', 'a', 'b', 'c', 'd', 'e', 'f', 'sink'].map((id, index) => ({
      id, domain: index === 0 ? 'A' : index === 7 ? 'C' : 'B',
    }))),
    edges: edges(['a', 'b', 'c', 'd', 'e', 'f'].flatMap(id => [
      ['source', id], [id, 'sink'],
    ] as const)),
  },
  {
    id: 'nested-subgroups',
    nodes: nodes(Array.from({ length: 8 }, (_, index) => ({
      id: `n${index}`,
      domain: index < 4 ? 'A' : 'B',
      subDomain: `${index < 4 ? 'A' : 'B'}-${index % 2}`,
    }))),
    edges: edges(Array.from({ length: 7 }, (_, index) => [`n${index}`, `n${index + 1}`] as const)),
  },
  {
    id: 'feedback-cycle',
    nodes: nodes(Array.from({ length: 6 }, (_, index) => ({
      id: `n${index}`, domain: index < 3 ? 'A' : 'B',
    }))),
    edges: edges([['n0', 'n1'], ['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n5'], ['n5', 'n1']]),
  },
  {
    id: 'fixed-ports',
    nodes: nodes(Array.from({ length: 6 }, (_, index) => ({
      id: `n${index}`, domain: index < 3 ? 'A' : 'B',
    }))),
    edges: edges(Array.from({ length: 5 }, (_, index) => [`n${index}`, `n${index + 1}`] as const), true),
  },
  {
    id: 'unbalanced-components',
    nodes: nodes([
      ...Array.from({ length: 8 }, (_, index) => ({ id: `a${index}`, domain: 'A' })),
      { id: 'b0', domain: 'B' },
      { id: 'c0', domain: 'C' },
    ]),
    edges: edges([
      ...Array.from({ length: 7 }, (_, index) => [`a${index}`, `a${index + 1}`] as const),
      ['b0', 'c0'],
    ]),
  },
  {
    id: 'multi-lane-handoff-fan',
    nodes: nodes([
      { id: 'entry-a', domain: 'A' },
      { id: 'entry-b', domain: 'A' },
      { id: 'gate-a', domain: 'B' },
      { id: 'gate-b', domain: 'B' },
      { id: 'gate-c', domain: 'B' },
      { id: 'service-a', domain: 'C' },
      { id: 'service-b', domain: 'C' },
      { id: 'audit-a', domain: 'D' },
      { id: 'audit-b', domain: 'D' },
      { id: 'exit', domain: 'E' },
    ]),
    edges: edges([
      ['entry-a', 'gate-a'], ['entry-a', 'gate-b'], ['entry-b', 'gate-b'], ['entry-b', 'gate-c'],
      ['gate-a', 'service-a'], ['gate-b', 'service-a'], ['gate-b', 'service-b'], ['gate-c', 'service-b'],
      ['service-a', 'audit-a'], ['service-a', 'audit-b'], ['service-b', 'audit-b'],
      ['audit-a', 'exit'], ['audit-b', 'exit'],
    ]),
  },
];

const directions = ['TB', 'BT', 'LR', 'RL'] as const;
type Direction = typeof directions[number];
type DirectionalQualityLimits = Readonly<{
  vertical: RoutedLayoutQuality;
  horizontal: RoutedLayoutQuality;
  reverseHorizontal?: RoutedLayoutQuality;
}>;

const qualityLimits: Readonly<Record<string, DirectionalQualityLimits>> = {
  'sparse-chain': {
    vertical: { width: 1075, height: 416, pathLength: 1208, backwardTravel: 248, bends: 4, crossings: 0, sharedLaneOverlap: 0 },
    horizontal: { width: 1198, height: 860, pathLength: 1180, backwardTravel: 0, bends: 2, crossings: 0, sharedLaneOverlap: 0 },
  },
  'dense-fan': {
    vertical: { width: 1123, height: 1340, pathLength: 11146, backwardTravel: 0, bends: 12, crossings: 0, sharedLaneOverlap: 172 },
    horizontal: { width: 2315, height: 860, pathLength: 14952, backwardTravel: 0, bends: 12, crossings: 0, sharedLaneOverlap: 358 },
  },
  'nested-subgroups': {
    vertical: { width: 1668, height: 1160, pathLength: 3692, backwardTravel: 0, bends: 7, crossings: 0, sharedLaneOverlap: 0 },
    horizontal: { width: 1552, height: 1344, pathLength: 3074, backwardTravel: 0, bends: 7, crossings: 0, sharedLaneOverlap: 0 },
  },
  'feedback-cycle': {
    vertical: { width: 634, height: 912, pathLength: 1847, backwardTravel: 496, bends: 3, crossings: 0, sharedLaneOverlap: 0 },
    horizontal: { width: 1198, height: 520, pathLength: 1990, backwardTravel: 708, bends: 3, crossings: 0, sharedLaneOverlap: 0 },
  },
  'fixed-ports': {
    vertical: { width: 634, height: 912, pathLength: 1776, backwardTravel: 0, bends: 10, crossings: 0, sharedLaneOverlap: 3 },
    horizontal: { width: 1198, height: 520, pathLength: 820, backwardTravel: 0, bends: 2, crossings: 0, sharedLaneOverlap: 0 },
    reverseHorizontal: { width: 1198, height: 520, pathLength: 1742, backwardTravel: 56, bends: 2, crossings: 0, sharedLaneOverlap: 7 },
  },
  'unbalanced-components': {
    vertical: { width: 1075, height: 1160, pathLength: 966, backwardTravel: 0, bends: 1, crossings: 0, sharedLaneOverlap: 0 },
    horizontal: { width: 1552, height: 860, pathLength: 1118, backwardTravel: 0, bends: 1, crossings: 0, sharedLaneOverlap: 0 },
  },
  'multi-lane-handoff-fan': {
    vertical: { width: 2400, height: 1800, pathLength: 22000, backwardTravel: 580, bends: 32, crossings: 0, sharedLaneOverlap: 128 },
    horizontal: { width: 3600, height: 1540, pathLength: 28000, backwardTravel: 580, bends: 32, crossings: 2, sharedLaneOverlap: 256 },
  },
};

const qualityLimitFor = (id: string, direction: Direction): RoutedLayoutQuality => {
  const limits = qualityLimits[id];
  if (!limits) throw new Error(`Missing quality limits for ${id}`);
  if (direction === 'RL' && limits.reverseHorizontal) return limits.reverseHorizontal;
  return direction === 'LR' || direction === 'RL' ? limits.horizontal : limits.vertical;
};

describe('domain Dagre generic complexity corpus', () => {
  it.each(corpus.flatMap(value => directions.map(direction => ({ value, direction }))))(
    'keeps $value.id geometry valid in $direction', async ({ value, direction }) => {
      const beforeNodes = structuredClone(value.nodes);
      const beforeEdges = structuredClone(value.edges);
      const result = await new DomainDagreLayoutStrategy().calculateLayout(value.nodes, value.edges, {
        type: LayoutType.DAGRE,
        nodeLayout: LayoutType.DAGRE,
        direction,
        domainPlacement: 'ordered-lanes',
        domainSubGroupDirection: direction,
        subDomainNodeDirection: direction,
        generateDomainGroups: true,
        generateSubDomainGroups: true,
        fitDomainContent: true,
        edgeRoutingQuality: 'interactive',
      });

      expect(evaluateLayoutGeometry(result.nodes).clean).toBe(true);
      expect(result.edges).toHaveLength(value.edges.length);
      expect(result.nodes.filter(node => node.type === 'custom')).toHaveLength(value.nodes.length);
      expect(auditBaseReactFlowDisplayCommercialQuality(result.edges)).toEqual([]);
      const quality = measureRoutedLayoutQuality(result.nodes, result.edges, direction);
      expect(quality).not.toBeNull();
      if (!quality) throw new Error('Missing complete routed quality vector');
      const limit = qualityLimitFor(value.id, direction);
      for (const key of ['width', 'height', 'pathLength', 'backwardTravel', 'bends', 'crossings', 'sharedLaneOverlap'] as const) {
        expect(quality[key], `Routed quality regressed: ${value.id} ${direction} ${key}`)
          .toBeLessThanOrEqual(limit[key] + 0.01);
      }
      expect(value.nodes).toEqual(beforeNodes);
      expect(value.edges).toEqual(beforeEdges);
      if (value.id === 'fixed-ports') {
        expect(result.edges.every(edge => edge.sourceHandle === 'right' && edge.targetHandle === 'left')).toBe(true);
      }
    },
  );

  it.each(directions)('bounds nested subgroup flow-axis slack in %s', async direction => {
    const value = corpus.find(entry => entry.id === 'nested-subgroups');
    if (!value) throw new Error('Missing nested subgroup corpus case');
    const result = await new DomainDagreLayoutStrategy().calculateLayout(value.nodes, value.edges, {
      type: LayoutType.DAGRE,
      nodeLayout: LayoutType.DAGRE,
      direction,
      domainPlacement: 'ordered-lanes',
      domainSubGroupDirection: direction,
      subDomainNodeDirection: direction,
      generateDomainGroups: true,
      generateSubDomainGroups: true,
      fitDomainContent: true,
      edgeRoutingQuality: 'interactive',
    });
    const projected = projectBaseReactFlowDisplayWorkerInput({ nodes: result.nodes, edges: result.edges });
    const horizontal = direction === 'LR' || direction === 'RL';
    const flow = horizontal ? 'x' : 'y';
    const size = horizontal ? 'width' : 'height';
    const byParent = new Map<string | undefined, typeof projected.nodes>();
    for (const node of projected.nodes.filter(candidate => candidate.type === 'custom')) {
      byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
    }

    for (const group of projected.nodes.filter(node => node.type === 'subGroup')) {
      const members = byParent.get(group.id) ?? [];
      expect(members.length).toBeGreaterThan(0);
      const contentStart = Math.min(...members.map(node => node.positionAbsolute[flow]));
      const contentEnd = Math.max(...members.map(node => node.positionAbsolute[flow]
        + Number(node.measured?.[size] ?? node[size])));
      const groupStart = group.positionAbsolute[flow];
      const groupEnd = groupStart + Number(group.measured?.[size] ?? group[size]);
      expect(contentStart - groupStart).toBeGreaterThanOrEqual(0);
      expect(groupEnd - contentEnd).toBeGreaterThanOrEqual(0);
      expect((contentStart - groupStart) + (groupEnd - contentEnd)).toBeLessThanOrEqual(horizontal ? 56 : 114);
    }
  });

  it.each(directions)('exposes the compact routed winner for an unbalanced rank tie in %s', async direction => {
    const value = corpus.find(entry => entry.id === 'unbalanced-components');
    if (!value) throw new Error('Missing unbalanced corpus case');
    const options = {
      type: LayoutType.DAGRE,
      nodeLayout: LayoutType.DAGRE,
      direction,
      domainPlacement: 'ordered-lanes' as const,
      domainSubGroupDirection: direction,
      subDomainNodeDirection: direction,
      generateDomainGroups: true,
      generateSubDomainGroups: true,
      fitDomainContent: true,
      edgeRoutingQuality: 'interactive' as const,
      laneRankPreference: 'auto' as const,
    };
    const strategy = new DomainDagreLayoutStrategy();
    const [baseline, alternative] = await Promise.all([
      strategy.calculateLayout(value.nodes, value.edges, options),
      strategy.calculateLayout(value.nodes, value.edges, { ...options, laneRankPreference: 'compact' }),
    ]);
    const decision = baseline.metadata?.laneRankDecision;
    if (!decision) throw new Error('Missing baseline lane-rank decision');
    const before = measureRoutedLayoutQuality(baseline.nodes, baseline.edges, direction);
    const after = measureRoutedLayoutQuality(alternative.nodes, alternative.edges, direction);
    expect(decision).toMatchObject({
      requested: 'auto', applied: 'global', reason: 'global-preserved',
    });
    expect(decision.metrics.global).toEqual(decision.metrics.compact);
    expect(routedLayoutDominates(before, after)).toBe(true);
    expect(after?.pathLength).toBeLessThan(before?.pathLength ?? 0);
    expect(after?.bends).toBeLessThan(before?.bends ?? 0);
  });
});
