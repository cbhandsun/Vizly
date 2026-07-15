import type { Node } from '@xyflow/react';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

export const isBaseReactFlowNodeHidden = (node: Node): boolean => (
  node.hidden === true || (isRecord(node.data) && node.data.hidden === true)
);

export const normalizeBaseReactFlowRenderableNodes = (nodes: Node[]): Node[] => {
  let changed = false;
  const normalized = nodes.map((node) => {
    const shouldHide = isBaseReactFlowNodeHidden(node);
    if (!shouldHide || node.hidden === true) return node;
    changed = true;
    return { ...node, hidden: true };
  });

  return changed ? normalized : nodes;
};

export const filterBaseReactFlowVisibleNodes = (nodes: Node[]): Node[] => (
  nodes.filter((node) => !isBaseReactFlowNodeHidden(node))
);

const finiteNodeNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

type BaseReactFlowInternalNodeLookup = Pick<Map<string, Node>, 'get'>;

/**
 * Full-quality display routing must use the DOM geometry published by React Flow.
 * Starting the worker from source fallbacks makes the first ResizeObserver update
 * invalidate the request and can repeatedly restart an expensive route.
 */
export const areBaseReactFlowInternalNodesReadyForRouting = (
  nodeIds: string[],
  nodeLookup: BaseReactFlowInternalNodeLookup | undefined,
): boolean => {
  if (nodeIds.length === 0 || !nodeLookup) return false;
  return nodeIds.every((nodeId) => {
    const node = nodeLookup.get(nodeId) as any;
    if (!node) return false;
    const absolute = node.internals?.positionAbsolute ?? node.positionAbsolute ?? node.position;
    const width = finiteNodeNumber(node.measured?.width ?? node.width);
    const height = finiteNodeNumber(node.measured?.height ?? node.height);
    return finiteNodeNumber(absolute?.x) !== undefined
      && finiteNodeNumber(absolute?.y) !== undefined
      && width !== undefined
      && height !== undefined
      && width > 0
      && height > 0;
  });
};

const geometrySignatureNumber = (value: unknown): string => {
  const number = finiteNodeNumber(value);
  return number === undefined ? '' : String(Math.round(number * 100) / 100);
};

/**
 * React Flow mutates nodeLookup entries in place when ResizeObserver publishes DOM geometry.
 * Selecting the Map reference therefore misses updates; this primitive signature lets Zustand
 * notify only when routing-relevant measured geometry actually changes.
 */
export const computeBaseReactFlowInternalNodeGeometrySignature = (
  nodeIds: string[],
  nodeLookup: BaseReactFlowInternalNodeLookup | undefined,
): string => nodeIds.map((nodeId) => {
  const node = nodeLookup?.get(nodeId) as any;
  if (!node) return `${nodeId.length}:${nodeId}:missing`;
  const absolute = node.internals?.positionAbsolute ?? node.positionAbsolute ?? node.position;
  return [
    `${nodeId.length}:${nodeId}`,
    geometrySignatureNumber(absolute?.x),
    geometrySignatureNumber(absolute?.y),
    geometrySignatureNumber(node.measured?.width ?? node.width),
    geometrySignatureNumber(node.measured?.height ?? node.height),
  ].join(':');
}).join('|');

export const collectBaseReactFlowInternalNodes = (
  nodeIds: string[],
  nodeLookup: BaseReactFlowInternalNodeLookup | undefined,
): Node[] => nodeIds
  .map(nodeId => nodeLookup?.get(nodeId))
  .filter((node): node is Node => Boolean(node));

export const mergeBaseReactFlowMeasuredNodes = (
  sourceNodes: Node[],
  internalNodes: Node[],
): Node[] => {
  if (sourceNodes.length === 0 || internalNodes.length === 0) return sourceNodes;
  const internalById = new Map(internalNodes.map(node => [node.id, node] as const));
  let changed = false;
  const merged = sourceNodes.map((sourceNode) => {
    const internalNode = internalById.get(sourceNode.id);
    if (!internalNode) return sourceNode;
    const internalMeasured = (internalNode as any).measured;
    const sourceMeasured = (sourceNode as any).measured;
    const width = finiteNodeNumber(internalMeasured?.width)
      ?? finiteNodeNumber(internalNode.width)
      ?? finiteNodeNumber(sourceMeasured?.width)
      ?? finiteNodeNumber(sourceNode.width);
    const height = finiteNodeNumber(internalMeasured?.height)
      ?? finiteNodeNumber(internalNode.height)
      ?? finiteNodeNumber(sourceMeasured?.height)
      ?? finiteNodeNumber(sourceNode.height);
    const position = internalNode.position ?? sourceNode.position;
    const positionAbsolute = (internalNode as any).positionAbsolute
      ?? (internalNode as any).internals?.positionAbsolute
      ?? (sourceNode as any).positionAbsolute;
    const nextMeasured = width !== undefined || height !== undefined
      ? { width, height }
      : sourceMeasured;
    const geometryChanged = position !== sourceNode.position
      || positionAbsolute !== (sourceNode as any).positionAbsolute
      || width !== finiteNodeNumber(sourceMeasured?.width ?? sourceNode.width)
      || height !== finiteNodeNumber(sourceMeasured?.height ?? sourceNode.height);
    if (!geometryChanged) return sourceNode;
    changed = true;
    return {
      ...sourceNode,
      position,
      ...(positionAbsolute ? { positionAbsolute } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(nextMeasured ? { measured: nextMeasured } : {}),
    } as Node;
  });
  return changed ? merged : sourceNodes;
};
