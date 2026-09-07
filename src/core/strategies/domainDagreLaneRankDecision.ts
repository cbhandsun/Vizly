import type { Edge, Node } from '@xyflow/react';
import type { LaneRankDecision, LaneRankMetrics, LaneRankMode, LaneRankPreference } from '../types/domainLaneRank';
import { getNodeDimensions } from './DomainDagreLayoutHelpers';
import { boundedDomainDagreNumber } from './domainDagreLayoutBoundary';
import { domainDagreDomainOf, isDomainDagreGroupNode, isDomainDagreNodeHidden } from './domainDagreHierarchy';
import { alignDomainDagreLaneFlow, SemanticLaneGeometryError, type SemanticLaneFlowOptions } from './domainDagreSemanticLaneFlow';

type Rect = { x: number; y: number; width: number; height: number };
const visibleLeaves = (nodes: Node[]) => nodes.filter(node => !isDomainDagreGroupNode(node) && !isDomainDagreNodeHidden(node));
const rect = (node: Node): Rect => ({ ...node.position, ...getNodeDimensions(node) });

/** Sweep a rectangle union, so overlapping business nodes never inflate occupancy. */
export function laneRectangleUnionArea(rectangles: readonly Rect[]): number {
  if (rectangles.some(value => ![value.x, value.y, value.width, value.height].every(Number.isFinite)
    || value.width < 0 || value.height < 0)) throw new SemanticLaneGeometryError();
  const xs = [...new Set(rectangles.flatMap(value => [value.x, value.x + value.width]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 1; index < xs.length; index++) {
    const left = xs[index - 1], right = xs[index];
    const intervals = rectangles.filter(value => value.x < right && value.x + value.width > left)
      .map(value => [value.y, value.y + value.height]).sort((a, b) => a[0] - b[0]);
    let end = -Infinity, height = 0;
    for (const [start, stop] of intervals) {
      height += Math.max(0, stop - Math.max(start, end));
      end = Math.max(end, stop);
    }
    area += (right - left) * height;
  }
  return area;
}

function relationships(nodes: Node[], edges: Edge[]): Edge[] {
  const ids = new Set(visibleLeaves(nodes).map(node => node.id));
  const seen = new Set<string>();
  return edges.filter(edge => {
    const key = JSON.stringify([edge.source, edge.target]);
    if (!ids.has(edge.source) || !ids.has(edge.target) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const gaps = (options: SemanticLaneFlowOptions) => ({
  horizontal: boundedDomainDagreNumber(options.horizontalGap, 120, options.direction === 'LR' || options.direction === 'RL' ? 40 : 120, 5000),
  vertical: boundedDomainDagreNumber(options.verticalGap, 120, options.direction === 'TB' || options.direction === 'BT' ? 30 : 120, 5000),
});

/** Content-free digest: identity text, positions and isolated nodes are excluded. */
export function connectedLaneInputFingerprint(nodes: Node[], edges: Edge[], options: SemanticLaneFlowOptions): string {
  const relations = relationships(nodes, edges);
  const connected = new Set(relations.flatMap(edge => [edge.source, edge.target]));
  const leaves = visibleLeaves(nodes).filter(node => connected.has(node.id));
  const ids = new Map(leaves.map((node, index) => [node.id, index]));
  const domains = new Map<string, number>(), subgroups = new Map<string, number>();
  const intern = (map: Map<string, number>, value: string) => {
    if (!map.has(value)) map.set(value, map.size);
    return map.get(value);
  };
  const byId = new Map(nodes.map(node => [node.id, node]));
  const shape = leaves.map(node => {
    const parent = byId.get(options.nodeToSubGroup?.get(node.id) ?? node.parentId ?? '');
    return [getNodeDimensions(node), intern(domains, domainDagreDomainOf(node)),
      parent?.type === 'subGroup' ? intern(subgroups, parent.id) : null];
  });
  const topology = relations.map(edge => [ids.get(edge.source), ids.get(edge.target)])
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0));
  const input = JSON.stringify([options.direction, gaps(options), shape, topology]);
  let hash1 = 2166136261, hash2 = 2246822507;
  for (let index = 0; index < input.length; index++) {
    hash1 = Math.imul(hash1 ^ input.charCodeAt(index), 16777619);
    hash2 = Math.imul(hash2 ^ input.charCodeAt(index), 3266489909);
  }
  return `lane-v1-${(hash1 >>> 0).toString(16)}-${(hash2 >>> 0).toString(16)}-${input.length}`;
}

function summarize(nodes: Node[], edges: Edge[], options: SemanticLaneFlowOptions) {
  for (const node of nodes.filter(value => !isDomainDagreNodeHidden(value))) {
    const bounds = rect(node);
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)
      || Math.abs(bounds.x) + bounds.width > 1_000_000 || Math.abs(bounds.y) + bounds.height > 1_000_000) {
      throw new SemanticLaneGeometryError();
    }
  }
  const horizontal = options.direction === 'LR' || options.direction === 'RL';
  const sign = options.direction === 'BT' || options.direction === 'RL' ? -1 : 1;
  const leaves = visibleLeaves(nodes);
  const domains = nodes.filter(node => node.type === 'titleGroup' && !isDomainDagreNodeHidden(node));
  const domainsByKey = new Map(domains.map(node => [domainDagreDomainOf(node), node]));
  const byId = new Map(leaves.map(node => [node.id, node]));
  const center = (node: Node) => sign * (horizontal
    ? node.position.x + getNodeDimensions(node).width / 2
    : node.position.y + getNodeDimensions(node).height / 2);
  const backtracks = new Map<string, number>();
  let backwardEdgeCount = 0;
  for (const edge of edges) {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target || domainDagreDomainOf(source) === domainDagreDomainOf(target)) continue;
    const travel = Math.max(0, center(source) - center(target));
    if (travel > 0) backwardEdgeCount++;
    backtracks.set(JSON.stringify([edge.source, edge.target]), travel);
  }
  const totalArea = domains.reduce((sum, node) => sum + getNodeDimensions(node).width * getNodeDimensions(node).height, 0);
  const occupied = laneRectangleUnionArea(leaves.filter(node => domainsByKey.has(domainDagreDomainOf(node))).map(rect));
  const metrics: LaneRankMetrics = {
    flowLength: Math.max(0, ...domains.map(node => getNodeDimensions(node)[horizontal ? 'width' : 'height'])),
    whitespaceRatio: totalArea > 0 ? Math.max(0, Math.min(1, 1 - occupied / totalArea)) : 0,
    backwardTravel: [...backtracks.values()].reduce((sum, value) => sum + value, 0),
    backwardEdgeCount,
  };
  return { nodes, metrics, backtracks };
}

export function chooseLaneRankMode(input: {
  global: LaneRankMetrics; compact: LaneRankMetrics; additionalBacktrackTravel: number;
  margin: number; previous?: LaneRankMode; unchanged: boolean;
}): { applied: LaneRankMode; reason: LaneRankDecision['reason']; score: number } {
  const score = input.global.flowLength - input.compact.flowLength - input.additionalBacktrackTravel;
  if (input.unchanged && input.previous) return { applied: input.previous, reason: 'unchanged-connected-flow', score };
  if (input.compact.whitespaceRatio > input.global.whitespaceRatio) return { applied: 'global', reason: 'global-preserved', score };
  if (score > input.margin) return { applied: 'compact', reason: 'compact-benefit', score };
  if (score < -input.margin) return { applied: 'global', reason: 'global-preserved', score };
  return { applied: input.previous ?? 'global', reason: input.previous ? 'hysteresis' : 'global-preserved', score };
}

export function selectDomainDagreLaneFlow(nodes: Node[], edges: Edge[], options: SemanticLaneFlowOptions & {
  laneRankPreference?: LaneRankPreference;
  previousLaneRankDecision?: LaneRankDecision;
}): { nodes: Node[]; decision: LaneRankDecision } {
  const requested = options.laneRankPreference === 'global' || options.laneRankPreference === 'compact'
    ? options.laneRankPreference : 'auto';
  const fingerprint = connectedLaneInputFingerprint(nodes, edges, options);
  const previous = options.previousLaneRankDecision;
  const base = { version: 1, policyVersion: 1, requested, direction: options.direction,
    connectedInputFingerprint: fingerprint } as const;
  const generate = (rankMode: LaneRankMode) => summarize(alignDomainDagreLaneFlow(nodes, edges, { ...options, rankMode }), edges, options);
  if (requested !== 'auto') {
    const candidate = generate(requested);
    return { nodes: candidate.nodes, decision: { ...base, applied: requested,
      reason: requested === 'global' ? 'manual-global' : 'manual-compact', metrics: { [requested]: candidate.metrics } } };
  }
  // Candidate failure is isolated only for auto; no route is run during ranking.
  const attempt = (mode: LaneRankMode) => {
    try { return { candidate: generate(mode) }; } catch (error: unknown) {
      if (!(error instanceof SemanticLaneGeometryError)) throw error;
      return { error };
    }
  };
  const globalResult = attempt('global'), compactResult = attempt('compact');
  const global = globalResult.candidate, compact = compactResult.candidate;
  if (!global && !compact) throw globalResult.error;
  if (!global || !compact) {
    const candidate = global ?? compact;
    if (!candidate) throw Error('No valid semantic lane candidate');
    const applied = global ? 'global' : 'compact';
    return { nodes: candidate.nodes, decision: { ...base, applied, reason: 'alternative-invalid', metrics: { [applied]: candidate.metrics } } };
  }
  const connected = new Set(relationships(nodes, edges).flatMap(edge => [edge.source, edge.target]));
  const horizontal = options.direction === 'LR' || options.direction === 'RL';
  const dimensions = visibleLeaves(nodes).filter(node => connected.has(node.id))
    .map(node => getNodeDimensions(node)[horizontal ? 'width' : 'height']).sort((a, b) => a - b);
  const middle = Math.floor(dimensions.length / 2);
  const median = dimensions.length ? (dimensions[middle] + dimensions[Math.max(0, Math.ceil(dimensions.length / 2) - 1)]) / 2 : 0;
  const margin = median + gaps(options)[horizontal ? 'horizontal' : 'vertical'];
  const additionalBacktrackTravel = [...compact.backtracks].reduce((sum, [key, travel]) => sum + Math.max(0, travel - (global.backtracks.get(key) ?? 0)), 0);
  const selection = chooseLaneRankMode({ global: global.metrics, compact: compact.metrics, additionalBacktrackTravel, margin,
    previous: previous?.applied, unchanged: previous?.policyVersion === 1 && previous.connectedInputFingerprint === fingerprint });
  return { nodes: selection.applied === 'global' ? global.nodes : compact.nodes, decision: {
    ...base, ...selection, metrics: { global: global.metrics, compact: compact.metrics },
    additionalBacktrackTravel, margin, ...(previous ? { previousApplied: previous.applied } : {}),
  } };
}
