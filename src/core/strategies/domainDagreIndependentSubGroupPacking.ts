import type { Edge, Node } from '@xyflow/react';
import { getNodeDimensions } from './DomainDagreLayoutHelpers';
import {
  domainDagreDomainOf,
  isDomainDagreGroupNode,
  isDomainDagreNodeHidden,
} from './domainDagreHierarchy';

type Axis = 'x' | 'y';
type Dimension = 'width' | 'height';

type AxisRect = Readonly<{
  id: string;
  flowStart: number;
  flowEnd: number;
  crossStart: number;
  crossEnd: number;
}>;

export interface IndependentSubGroupPackingOptions {
  horizontal: boolean;
  flowGap: number;
  crossGap: number;
  domainGap: number;
  flowInsets: Readonly<{ leading: number; trailing: number }>;
  crossInsets: Readonly<{ leading: number; trailing: number }>;
}

const MAX_PACKED_SUBGROUPS_PER_DOMAIN = 64;
const MAX_PACKING_DISTANCE = 1_000_000;

const boundedSpacing = (value: number): number | null => (
  Number.isFinite(value) && value >= 0 && value <= 10_000 ? value : null
);

const axisRect = (
  node: Node,
  flow: Axis,
  cross: Axis,
  flowDimension: Dimension,
  crossDimension: Dimension,
): AxisRect | null => {
  const dimensions = getNodeDimensions(node);
  const flowStart = node.position[flow];
  const crossStart = node.position[cross];
  const flowSize = dimensions[flowDimension];
  const crossSize = dimensions[crossDimension];
  if (![flowStart, crossStart, flowSize, crossSize].every(Number.isFinite)
    || flowSize <= 0 || crossSize <= 0
    || Math.abs(flowStart) + flowSize > MAX_PACKING_DISTANCE
    || Math.abs(crossStart) + crossSize > MAX_PACKING_DISTANCE) return null;
  return {
    id: node.id,
    flowStart,
    flowEnd: flowStart + flowSize,
    crossStart,
    crossEnd: crossStart + crossSize,
  };
};

const overlapsWithSpacing = (
  candidate: AxisRect,
  occupied: AxisRect,
  flowGap: number,
  crossGap: number,
): boolean => {
  const separatedAlongFlow = candidate.flowEnd + flowGap <= occupied.flowStart
    || occupied.flowEnd + flowGap <= candidate.flowStart;
  const separatedAlongCross = candidate.crossEnd + crossGap <= occupied.crossStart
    || occupied.crossEnd + crossGap <= candidate.crossStart;
  return !separatedAlongFlow && !separatedAlongCross;
};

const translatedRect = (
  rect: AxisRect,
  flowStart: number,
  crossStart: number,
): AxisRect => ({
  ...rect,
  flowStart,
  flowEnd: flowStart + rect.flowEnd - rect.flowStart,
  crossStart,
  crossEnd: crossStart + rect.crossEnd - rect.crossStart,
});

const uniqueSorted = (values: readonly number[]): number[] => (
  [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right)
);

const findPackingPosition = (
  rect: AxisRect,
  occupied: readonly AxisRect[],
  bounds: Readonly<{ flowStart: number; flowEnd: number; crossStart: number; crossEnd: number }>,
  flowGap: number,
  crossGap: number,
): AxisRect => {
  const flowSize = rect.flowEnd - rect.flowStart;
  const crossSize = rect.crossEnd - rect.crossStart;
  const flowCandidates = uniqueSorted([
    bounds.flowStart,
    rect.flowStart,
    ...occupied.flatMap(item => [
      item.flowEnd + flowGap,
      item.flowStart - flowGap - flowSize,
    ]),
  ]);
  const crossCandidates = uniqueSorted([
    bounds.crossStart,
    rect.crossStart,
    ...occupied.flatMap(item => [
      item.crossEnd + crossGap,
      item.crossStart - crossGap - crossSize,
    ]),
  ]);
  const occupiedCrossEnd = Math.max(bounds.crossStart, ...occupied.map(item => item.crossEnd));
  let best = rect;
  let bestScore: readonly number[] = [
    Math.max(occupiedCrossEnd, rect.crossEnd),
    rect.crossStart,
    rect.flowStart,
    0,
  ];
  for (const crossStart of crossCandidates) for (const flowStart of flowCandidates) {
    const candidate = translatedRect(rect, flowStart, crossStart);
    if (candidate.flowStart < bounds.flowStart - 0.5
      || candidate.flowEnd > bounds.flowEnd + 0.5
      || candidate.crossStart < bounds.crossStart - 0.5
      || candidate.crossEnd > bounds.crossEnd + 0.5
      || occupied.some(item => overlapsWithSpacing(candidate, item, flowGap, crossGap))) continue;
    const score = [
      Math.max(occupiedCrossEnd, candidate.crossEnd),
      candidate.crossStart,
      candidate.flowStart,
      Math.abs(candidate.flowStart - rect.flowStart) + Math.abs(candidate.crossStart - rect.crossStart),
    ] as const;
    if (score.some((value, index) => value < bestScore[index]
      && score.slice(0, index).every((prefix, prefixIndex) => prefix === bestScore[prefixIndex]))) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
};

const resizeAlongCross = (
  node: Node,
  size: number,
  crossDimension: Dimension,
): Node => {
  const dimensions = { ...getNodeDimensions(node), [crossDimension]: size };
  return {
    ...node,
    ...dimensions,
    measured: dimensions,
    style: { ...node.style, ...dimensions },
  };
};

/**
 * Packs only subdomains without boundary edges into unused space in their
 * parent lane. Boundary-connected subdomains retain the shared process ranks.
 * The operation is immutable and runs before final edge routing.
 */
export function packIndependentDomainDagreSubGroups(
  nodes: readonly Node[],
  edges: readonly Edge[],
  nodeToSubGroup: ReadonlyMap<string, string>,
  options: IndependentSubGroupPackingOptions,
): Node[] {
  const flowGap = boundedSpacing(options.flowGap);
  const crossGap = boundedSpacing(options.crossGap);
  const domainGap = boundedSpacing(options.domainGap);
  const flowLeading = boundedSpacing(options.flowInsets.leading);
  const flowTrailing = boundedSpacing(options.flowInsets.trailing);
  const crossLeading = boundedSpacing(options.crossInsets.leading);
  const crossTrailing = boundedSpacing(options.crossInsets.trailing);
  if ([flowGap, crossGap, domainGap, flowLeading, flowTrailing, crossLeading, crossTrailing]
    .some(value => value === null)) return nodes.slice();

  const safeFlowGap = flowGap ?? 0;
  const safeCrossGap = crossGap ?? 0;
  const safeDomainGap = domainGap ?? 0;
  const safeFlowLeading = flowLeading ?? 0;
  const safeFlowTrailing = flowTrailing ?? 0;
  const safeCrossLeading = crossLeading ?? 0;
  const safeCrossTrailing = crossTrailing ?? 0;
  const flow: Axis = options.horizontal ? 'x' : 'y';
  const cross: Axis = options.horizontal ? 'y' : 'x';
  const flowDimension: Dimension = options.horizontal ? 'width' : 'height';
  const crossDimension: Dimension = options.horizontal ? 'height' : 'width';
  const originalById = new Map(nodes.map(node => [node.id, node]));
  const replacements = new Map(nodes.map(node => [node.id, node]));
  if (nodes.some(node => !isDomainDagreNodeHidden(node)
    && !axisRect(node, flow, cross, flowDimension, crossDimension))) return nodes.slice();
  const visibleLeaves = nodes.filter(node => !isDomainDagreGroupNode(node) && !isDomainDagreNodeHidden(node));
  const boundaryConnectedSubGroups = new Set<string>();
  for (const edge of edges) {
    const sourceSubGroup = nodeToSubGroup.get(edge.source);
    const targetSubGroup = nodeToSubGroup.get(edge.target);
    if (sourceSubGroup && sourceSubGroup !== targetSubGroup) boundaryConnectedSubGroups.add(sourceSubGroup);
    if (targetSubGroup && targetSubGroup !== sourceSubGroup) boundaryConnectedSubGroups.add(targetSubGroup);
  }

  const visibleDomains = nodes.filter(node => node.type === 'titleGroup' && !isDomainDagreNodeHidden(node));
  let packedAny = false;
  for (const domain of visibleDomains) {
    const domainKey = domainDagreDomainOf(domain);
    if (!domainKey || visibleLeaves.some(node => (
      domainDagreDomainOf(node) === domainKey && !nodeToSubGroup.has(node.id)
    ))) continue;
    const subGroups = nodes.filter(node => node.type === 'subGroup'
      && !isDomainDagreNodeHidden(node)
      && domainDagreDomainOf(node) === domainKey);
    if (subGroups.length <= 1 || subGroups.length > MAX_PACKED_SUBGROUPS_PER_DOMAIN) continue;
    const domainRect = axisRect(domain, flow, cross, flowDimension, crossDimension);
    const groupRects = subGroups.map(group => ({
      group,
      rect: axisRect(group, flow, cross, flowDimension, crossDimension),
    }));
    if (!domainRect || groupRects.some(item => !item.rect)) continue;
    const bounds = {
      flowStart: domainRect.flowStart + safeFlowLeading,
      flowEnd: domainRect.flowEnd - safeFlowTrailing,
      crossStart: domainRect.crossStart + safeCrossLeading,
      crossEnd: domainRect.crossEnd - safeCrossTrailing,
    };
    if (bounds.flowEnd <= bounds.flowStart || bounds.crossEnd <= bounds.crossStart) continue;
    const anchored = groupRects.filter(item => boundaryConnectedSubGroups.has(item.group.id));
    const movable = groupRects.filter(item => !boundaryConnectedSubGroups.has(item.group.id))
      .sort((left, right) => (left.rect?.crossStart ?? 0) - (right.rect?.crossStart ?? 0)
        || (left.rect?.flowStart ?? 0) - (right.rect?.flowStart ?? 0));
    const occupied = anchored.flatMap(item => item.rect ? [item.rect] : []);
    for (const item of movable) {
      if (!item.rect) continue;
      const packed = findPackingPosition(item.rect, occupied, bounds, safeFlowGap, safeCrossGap);
      occupied.push(packed);
      const flowDelta = packed.flowStart - item.rect.flowStart;
      const crossDelta = packed.crossStart - item.rect.crossStart;
      if (Math.abs(flowDelta) <= 0.5 && Math.abs(crossDelta) <= 0.5) continue;
      packedAny = true;
      for (const [nodeId, subGroupId] of nodeToSubGroup) {
        if (subGroupId !== item.group.id) continue;
        const child = replacements.get(nodeId);
        if (!child) continue;
        replacements.set(nodeId, {
          ...child,
          position: {
            ...child.position,
            [flow]: child.position[flow] + flowDelta,
            [cross]: child.position[cross] + crossDelta,
          },
        });
      }
      const group = replacements.get(item.group.id) ?? item.group;
      replacements.set(item.group.id, {
        ...group,
        position: {
          ...group.position,
          [flow]: group.position[flow] + flowDelta,
          [cross]: group.position[cross] + crossDelta,
        },
      });
    }
    if (!occupied.length) continue;
    const requiredCrossEnd = Math.max(...occupied.map(item => item.crossEnd)) + safeCrossTrailing;
    const requiredCrossSize = requiredCrossEnd - domainRect.crossStart;
    const currentDomain = replacements.get(domain.id) ?? domain;
    const currentCrossSize = getNodeDimensions(currentDomain)[crossDimension];
    if (requiredCrossSize > 0 && requiredCrossSize < currentCrossSize - 0.5) {
      replacements.set(domain.id, resizeAlongCross(currentDomain, requiredCrossSize, crossDimension));
      packedAny = true;
    }
  }
  if (!packedAny) return nodes.slice();

  const orderedDomains = visibleDomains.toSorted((left, right) => left.position[cross] - right.position[cross]);
  let domainCursor = Math.min(...orderedDomains.map(domain => domain.position[cross]));
  for (const originalDomain of orderedDomains) {
    const domain = replacements.get(originalDomain.id) ?? originalDomain;
    const delta = domainCursor - domain.position[cross];
    const domainKey = domainDagreDomainOf(domain);
    if (Math.abs(delta) > 0.5) {
      for (const original of nodes) {
        if (domainDagreDomainOf(original) !== domainKey) continue;
        const current = replacements.get(original.id) ?? originalById.get(original.id);
        if (!current) continue;
        replacements.set(original.id, {
          ...current,
          position: { ...current.position, [cross]: current.position[cross] + delta },
        });
      }
    }
    const finalDomain = replacements.get(originalDomain.id) ?? domain;
    domainCursor += getNodeDimensions(finalDomain)[crossDimension] + safeDomainGap;
  }
  return nodes.map(node => replacements.get(node.id) ?? node);
}
