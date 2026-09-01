import type { Node } from '@xyflow/react';

import { normalizeRenderPoint } from './edgeGeometry';
import type { RenderPoint } from './types';

type PositionAwareNode = Node & {
  positionAbsolute?: unknown;
  internals?: { positionAbsolute?: unknown };
};

interface PositionResolution {
  composable: boolean;
  position: RenderPoint;
}

const localNodePosition = (node: Node): RenderPoint => (
  normalizeRenderPoint(node.position) ?? { x: 0, y: 0 }
);

const explicitAbsolutePosition = (node: Node): RenderPoint | null => {
  const candidate = node as PositionAwareNode;
  return normalizeRenderPoint(
    candidate.positionAbsolute ?? candidate.internals?.positionAbsolute,
  );
};

const normalizedParentId = (node: Node): string => (
  typeof node.parentId === 'string' ? node.parentId.trim() : ''
);

export const resolveAbsoluteRenderNodePositions = (
  nodes: readonly Node[],
): ReadonlyMap<string, RenderPoint> => {
  const nodesById = new Map<string, Node>();
  for (const node of nodes) {
    const id = String(node.id ?? '').trim();
    if (id && !nodesById.has(id)) nodesById.set(id, node);
  }

  const activeIds = new Set<string>();
  const resolutions = new Map<string, PositionResolution>();
  const resolve = (node: Node): PositionResolution => {
    const id = String(node.id ?? '').trim();
    const cached = resolutions.get(id);
    if (cached) return cached;

    const local = localNodePosition(node);
    const explicit = explicitAbsolutePosition(node);
    if (explicit) {
      const result = { composable: true, position: explicit };
      resolutions.set(id, result);
      return result;
    }

    const parentId = normalizedParentId(node);
    const parent = parentId && parentId !== id ? nodesById.get(parentId) : undefined;
    if (!parent) {
      const result = { composable: parentId !== id, position: local };
      resolutions.set(id, result);
      return result;
    }
    if (activeIds.has(id)) return { composable: false, position: local };

    activeIds.add(id);
    const parentResolution = resolve(parent);
    activeIds.delete(id);
    const absolute = parentResolution.composable
      ? normalizeRenderPoint({
        x: parentResolution.position.x + local.x,
        y: parentResolution.position.y + local.y,
      })
      : null;
    const result = absolute
      ? { composable: true, position: absolute }
      : { composable: false, position: local };
    resolutions.set(id, result);
    return result;
  };

  for (const node of nodes) resolve(node);
  return new Map(
    nodes.map(node => {
      const id = String(node.id ?? '').trim();
      return [id, resolutions.get(id)?.position ?? localNodePosition(node)] as const;
    }),
  );
};
