import type { Edge, Node } from '@xyflow/react';
import { autoMindMapLayout } from '../../../utils/LayoutAlgorithms';

export const toggleMindMapNodeCollapse = (
  nodes: Node[],
  edges: Edge[],
  nodeId: string,
): Node[] => {
  const targetNode = nodes.find(node => node.id === nodeId);
  if (!targetNode) return nodes;
  const collapsed = Boolean(targetNode.data?.collapsed);
  let nextNodes = nodes.map(node => node.id === nodeId
    ? { ...node, data: { ...node.data, collapsed: !collapsed } }
    : node);
  const childrenMap = new Map<string, string[]>();
  const parentSet = new Set<string>();
  for (const edge of edges) {
    const children = childrenMap.get(edge.source) ?? [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
    parentSet.add(edge.target);
  }
  const nodeMap = new Map(nextNodes.map(node => [node.id, node]));
  const visibility = new Map<string, { hidden: boolean; count: number }>();
  const traverse = (currentId: string, parentHidden: boolean, parentCollapsed: boolean): void => {
    const node = nodeMap.get(currentId);
    const hidden = parentHidden || parentCollapsed;
    const children = childrenMap.get(currentId) ?? [];
    visibility.set(currentId, { hidden, count: children.length });
    for (const childId of children) {
      traverse(childId, hidden, Boolean(node?.data?.collapsed));
    }
  };
  nextNodes
    .filter(node => node.type === 'mindmap' && !parentSet.has(node.id))
    .forEach(root => traverse(root.id, false, false));
  nextNodes = nextNodes.map(node => {
    if (node.type !== 'mindmap') return node;
    const state = visibility.get(node.id);
    return state
      ? { ...node, hidden: state.hidden, data: { ...node.data, childrenCount: state.count } }
      : node;
  });
  const visibleNodes = nextNodes.filter(node => node.type === 'mindmap' && !node.hidden);
  const visibleEdges = edges
    .map(edge => ({ ...edge, hidden: visibility.get(edge.target)?.hidden ?? edge.hidden }))
    .filter(edge => !edge.hidden);
  const rootNode = visibleNodes.find(node => node.data?.depth === 0);
  const direction = typeof rootNode?.data?.direction === 'string' ? rootNode.data.direction : 'LR';
  const positions = autoMindMapLayout(visibleNodes, visibleEdges, direction, {
    nodeSpacing: 48,
    levelSpacing: 140,
  });
  return nextNodes.map(node => node.type === 'mindmap' && positions.has(node.id)
    ? { ...node, position: positions.get(node.id)! }
    : node);
};

export const collapseAllMindMapBranches = (nodes: Node[], edges: Edge[]): Node[] => {
  const parents = new Set(edges
    .filter(edge => edge.type !== 'relationshipEdge')
    .map(edge => edge.source));
  return nodes.map(node => {
    if (node.type !== 'mindmap' || !parents.has(node.id)) return node;
    const depth = typeof node.data?.depth === 'number' ? node.data.depth : undefined;
    const root = depth === 0 || (depth === undefined && node.data?.direction !== undefined);
    return root ? node : { ...node, data: { ...node.data, collapsed: true } };
  });
};

export const expandAllMindMapNodes = (nodes: Node[]): Node[] => nodes.map(node => (
  node.type === 'mindmap' && node.data?.collapsed
    ? { ...node, data: { ...node.data, collapsed: false }, hidden: false }
    : node
));
