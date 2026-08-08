import type { Edge } from '@xyflow/react';

export interface EdgeMutationResult {
  changed: boolean;
  edges: Edge[];
}

const unchanged = (edges: Edge[]): EdgeMutationResult => ({ changed: false, edges });

const mutateTargetEdge = (
  edges: Edge[],
  targetId: string | undefined,
  mutate: (edge: Edge) => Edge | null,
): EdgeMutationResult => {
  if (!targetId) return unchanged(edges);
  const index = edges.findIndex(edge => edge.id === targetId);
  if (index < 0) return unchanged(edges);

  const nextEdge = mutate(edges[index]);
  if (!nextEdge || nextEdge === edges[index]) return unchanged(edges);

  const nextEdges = [...edges];
  nextEdges[index] = nextEdge;
  return { changed: true, edges: nextEdges };
};

export const reverseDiagramEdge = (
  edges: Edge[],
  targetId: string | undefined,
): EdgeMutationResult => mutateTargetEdge(edges, targetId, edge => {
  const waypoints = Array.isArray(edge.data?.waypoints) ? edge.data.waypoints : [];
  const isNoOp = edge.source === edge.target
    && edge.sourceHandle === edge.targetHandle
    && waypoints.length === 0;
  if (isNoOp) return null;

  return {
    ...edge,
    source: edge.target,
    target: edge.source,
    sourceHandle: edge.targetHandle,
    targetHandle: edge.sourceHandle,
    data: { ...edge.data, waypoints: [] },
  };
});

export const resetDiagramEdgeWaypoints = (
  edges: Edge[],
  targetId: string | undefined,
): EdgeMutationResult => mutateTargetEdge(edges, targetId, edge => {
  if (!Array.isArray(edge.data?.waypoints) || edge.data.waypoints.length === 0) return null;
  return { ...edge, data: { ...edge.data, waypoints: [] } };
});

export const convertDiagramEdgeToEditable = (
  edges: Edge[],
  targetId: string | undefined,
): EdgeMutationResult => mutateTargetEdge(edges, targetId, edge => {
  if (edge.type === 'editable') return null;
  return {
    ...edge,
    type: 'editable',
    selected: true,
    data: { ...edge.data, originalType: edge.type || 'smart' },
  };
});

export const stopEditingDiagramEdge = (
  edges: Edge[],
  targetId: string | undefined,
): EdgeMutationResult => mutateTargetEdge(edges, targetId, edge => {
  if (edge.type !== 'editable') return null;
  const originalType = typeof edge.data?.originalType === 'string' && edge.data.originalType.trim()
    ? edge.data.originalType
    : 'smart';
  const nextData = { ...edge.data };
  delete nextData.originalType;

  return {
    ...edge,
    type: originalType,
    selected: false,
    data: nextData,
  };
});
