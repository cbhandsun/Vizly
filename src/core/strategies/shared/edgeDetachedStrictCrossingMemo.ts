import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { getRoutingObstacles, type Point } from './edgeDetachedOverlapGeometry';
import { edgeRoutingQualityIntentToken } from './edgeRoutingQualityIntent';

const SIGNATURE_VERSION = 'detached-strict-v1';

const numberToken = (value: number): string => {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return '+Infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
  if (Object.is(value, -0)) return '-0';
  return String(value);
};

const nullableString = (value: unknown): string | null => (
  typeof value === 'string' ? value : value == null ? null : String(value)
);

/**
 * Builds the exact identity of every input consumed by the detached strict
 * crossing repair. The obstacle token deliberately comes from the same
 * normalized rectangles used by the solver, so in-place node mutations cannot
 * leave a stale cache hit while irrelevant node data does not churn the memo.
 */
export const buildDetachedStrictCrossingRepairSignature = (
  edges: readonly Edge[],
  nodes: ReactFlowNode[],
  paths: readonly (readonly Point[])[],
): string => JSON.stringify([
  SIGNATURE_VERSION,
  edges.map((edge, index) => [
    nullableString(edge.id),
    nullableString(edge.source),
    nullableString(edge.target),
    nullableString(edge.sourceHandle),
    nullableString(edge.targetHandle),
    edgeRoutingQualityIntentToken(edge),
    (paths[index] ?? []).map(point => [numberToken(point.x), numberToken(point.y)]),
  ]),
  [...getRoutingObstacles(nodes)].map(([nodeId, rect]) => [
    nodeId,
    numberToken(rect.x),
    numberToken(rect.y),
    numberToken(rect.width),
    numberToken(rect.height),
  ]),
]);

export type DetachedStrictCrossingPathPatch = {
  edgeIndex: number;
  path: Point[];
};

const clonePatches = (
  patches: readonly Readonly<DetachedStrictCrossingPathPatch>[],
): DetachedStrictCrossingPathPatch[] => patches.map(patch => ({
  edgeIndex: patch.edgeIndex,
  path: patch.path.map(point => ({ x: point.x, y: point.y })),
}));

/**
 * Small content-addressed LRU. Values are copied both into and out of the memo:
 * later routing stages may mutate edge data in place, but can never corrupt a
 * cached solution or make it observable through another edge array.
 */
export class DetachedStrictCrossingRepairMemo {
  private readonly entries = new Map<string, DetachedStrictCrossingPathPatch[]>();

  constructor(private readonly capacity: number) {}

  get(signature: string): DetachedStrictCrossingPathPatch[] | null {
    const cached = this.entries.get(signature);
    if (!cached) return null;
    this.entries.delete(signature);
    this.entries.set(signature, cached);
    return clonePatches(cached);
  }

  set(
    signature: string,
    patches: readonly Readonly<DetachedStrictCrossingPathPatch>[],
  ): void {
    if (this.capacity <= 0) return;
    this.entries.delete(signature);
    this.entries.set(signature, clonePatches(patches));
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
