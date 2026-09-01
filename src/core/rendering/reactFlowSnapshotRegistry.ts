import type { Edge, Node } from '@xyflow/react';

import type { ReactFlowRenderSnapshot } from './reactFlowScene';

type SnapshotProvider = () => unknown;

const MAX_DIAGRAM_ID_LENGTH = 200;
const providersByDiagramId = new Map<string, Set<SnapshotProvider>>();

const normalizeDiagramId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_DIAGRAM_ID_LENGTH
    ? normalized
    : null;
};
const coerceSnapshot = (value: unknown): ReactFlowRenderSnapshot | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    edges?: unknown;
    nodes?: unknown;
    viewport?: unknown;
  };
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) return null;
  const viewport = candidate.viewport;
  const validViewport = viewport && typeof viewport === 'object'
    ? viewport as { x?: unknown; y?: unknown; zoom?: unknown }
    : undefined;
  return {
    nodes: candidate.nodes as Node[],
    edges: candidate.edges as Edge[],
    viewport: validViewport,
  };
};

export const registerReactFlowSnapshotProvider = (
  diagramId: unknown,
  provider: SnapshotProvider,
): (() => void) => {
  const normalizedId = normalizeDiagramId(diagramId);
  if (!normalizedId || typeof provider !== 'function') return () => {};
  const providers = providersByDiagramId.get(normalizedId) ?? new Set<SnapshotProvider>();
  providers.add(provider);
  providersByDiagramId.set(normalizedId, providers);
  return () => {
    providers.delete(provider);
    if (providers.size === 0) providersByDiagramId.delete(normalizedId);
  };
};

export const readRegisteredReactFlowSnapshot = (
  diagramId: unknown,
): ReactFlowRenderSnapshot | null => {
  const normalizedId = normalizeDiagramId(diagramId);
  if (!normalizedId) return null;
  const providers = providersByDiagramId.get(normalizedId);
  if (!providers) return null;
  let best: ReactFlowRenderSnapshot | null = null;
  for (const provider of providers) {
    try {
      const snapshot = coerceSnapshot(provider());
      if (!snapshot) continue;
      if (
        !best
        || snapshot.nodes.length > best.nodes.length
        || (
          snapshot.nodes.length === best.nodes.length
          && snapshot.edges.length > best.edges.length
        )
      ) {
        best = snapshot;
      }
    } catch {
      // A stale canvas provider must not block another live canvas for the same diagram.
    }
  }
  return best;
};
