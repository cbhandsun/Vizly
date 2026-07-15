import type { Edge, Node } from '@xyflow/react';

import { EDGE_ROUTING_CACHE_VERSION } from '../../routing/routingVersion';

export type BaseReactFlowDisplayInputIdentity = {
  nodes: Node[];
  edges: Edge[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
};

type IdentityFeed = (value: unknown) => void;

const isFiniteIdentityPoint = (value: unknown): value is { x: number; y: number } => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
};

const feedIdentityPath = (feed: IdentityFeed, path: unknown): void => {
  if (!Array.isArray(path)) {
    feed('no-path');
    return;
  }
  feed(path.length);
  for (const point of path) {
    if (!isFiniteIdentityPoint(point)) {
      feed('invalid-point');
      continue;
    }
    feed(Math.round(point.x));
    feed(Math.round(point.y));
  }
};

/**
 * Visits the exact normalized fields used to identify a display-routing input.
 * Both the compact cache key and the independent collision guard consume this
 * visitor so they cannot silently drift to different input contracts.
 */
export const visitBaseReactFlowDisplayInputIdentity = (
  {
    nodes,
    edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  }: BaseReactFlowDisplayInputIdentity,
  feed: IdentityFeed,
): void => {
  const feedGeometry = (value: unknown): void => {
    const numeric = Number(value);
    feed(Number.isFinite(numeric) ? Math.round(numeric * 1_000) / 1_000 : 'invalid-geometry');
  };

  feed(EDGE_ROUTING_CACHE_VERSION);
  feed(enableSmartEdges);
  feed(Number.isFinite(smartEdgePadding) ? Math.round(smartEdgePadding) : 'invalid-padding');
  feed(isLargeGraph);
  nodes.forEach((node) => {
    const pos = (node as any)?.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
    const measured = (node as any).measured;
    const data = (node.data && typeof node.data === 'object')
      ? node.data as Record<string, unknown>
      : {};
    feed(node.id);
    feed(node.type);
    feed((node as any).parentId);
    feed(Boolean((node as any).positionAbsolute));
    feed(data.layoutDirection);
    feedGeometry(pos.x ?? 0);
    feedGeometry(pos.y ?? 0);
    feedGeometry(measured?.width ?? node.width ?? (node.style as any)?.width ?? 0);
    feedGeometry(measured?.height ?? node.height ?? (node.style as any)?.height ?? 0);
  });
  edges.forEach((edge) => {
    const data = (edge.data && typeof edge.data === 'object')
      ? edge.data as Record<string, unknown>
      : {};
    feed(edge.id);
    feed(edge.source);
    feed(edge.target);
    feed(edge.sourceHandle);
    feed(edge.targetHandle);
    feed(edge.type);
    feed((edge as any).label);
    feed(data.label);
    feed(data.layoutDirection);
    feed(data.layoutPathLocked);
    feed(data._layoutPathLocked);
    feed(data.autoSource);
    feed(data.autoTarget);
    feed(Array.isArray(data.auto) ? data.auto.map(String).join(',') : data.auto);
    feed(Array.isArray(data.manualHandleSides)
      ? data.manualHandleSides.map(String).join(',')
      : data.manualHandleSides);
    feed(Array.isArray(data.manualHandlePositions)
      ? data.manualHandlePositions.map(String).join(',')
      : data.manualHandlePositions);
    const manualHandles = (data.manualHandles && typeof data.manualHandles === 'object')
      ? data.manualHandles as Record<string, unknown>
      : {};
    feed(data.manualHandles === true);
    feed(manualHandles.source);
    feed(manualHandles.target);
    const legacyManualHandles = data.manualHandles == null
      ? data._manualHandles
      : undefined;
    const legacyManualHandleRecord = (
      legacyManualHandles
      && typeof legacyManualHandles === 'object'
      && !Array.isArray(legacyManualHandles)
    ) ? legacyManualHandles as Record<string, unknown> : {};
    if (
      legacyManualHandles === true
      || Boolean(legacyManualHandleRecord.source)
      || Boolean(legacyManualHandleRecord.target)
    ) {
      feed('_manualHandles');
      feed(legacyManualHandles === true);
      feed(legacyManualHandleRecord.source);
      feed(legacyManualHandleRecord.target);
    }
    feed(data.sourceHandleLocked);
    feed(data.targetHandleLocked);
    feed(data.sourceHandlePositionLocked);
    feed(data.targetHandlePositionLocked);
    feed(data.sourcePortPolicy);
    feed(data.targetPortPolicy);
    feed(data.sourcePortConstraint);
    feed(data.targetPortConstraint);
    feed(data.obstaclePadding);
    const edgeConfig = (data.edgeConfig && typeof data.edgeConfig === 'object')
      ? data.edgeConfig as Record<string, unknown>
      : {};
    feed(edgeConfig.obstaclePadding);
    const runtimeHandleLock = (data.runtimeHandleLock && typeof data.runtimeHandleLock === 'object')
      ? data.runtimeHandleLock as Record<string, unknown>
      : {};
    feed(runtimeHandleLock.source);
    feed(runtimeHandleLock.target);
    if (data.runtimeHandleLock === true) feed('runtimeHandleLock:true');
    const legacyRuntimeHandleLock = data.runtimeHandleLock == null
      ? data._runtimeHandleLock
      : undefined;
    const legacyRuntimeHandleLockRecord = (
      legacyRuntimeHandleLock
      && typeof legacyRuntimeHandleLock === 'object'
      && !Array.isArray(legacyRuntimeHandleLock)
    ) ? legacyRuntimeHandleLock as Record<string, unknown> : {};
    if (
      legacyRuntimeHandleLock === true
      || Boolean(legacyRuntimeHandleLockRecord.source)
      || Boolean(legacyRuntimeHandleLockRecord.target)
    ) {
      feed('_runtimeHandleLock');
      feed(legacyRuntimeHandleLock === true);
      feed(legacyRuntimeHandleLockRecord.source);
      feed(legacyRuntimeHandleLockRecord.target);
    }
    feed(data.isTreeBus);
    feed(data.sharedTrunkAware);
    feed(data.sharedTrunkSynthesized);
    const treeRouting = (data.treeRouting && typeof data.treeRouting === 'object')
      ? data.treeRouting as Record<string, unknown>
      : {};
    // Hard-quality scoring distinguishes an absent treeRouting value from any
    // present (including empty) routing object. Keep the cache/precompiled
    // identity aligned with that intent token so an empty tree declaration
    // cannot replay a report produced for an unrelated ordinary edge.
    feed(Boolean(data.treeRouting));
    feed(treeRouting.effectiveSourceHandle);
    feed(treeRouting.effectiveTargetHandle);
    feedIdentityPath(feed, data.computedPath);
    feedIdentityPath(feed, data.elkPath);
    feedIdentityPath(feed, treeRouting.points);
  });
};

const digestValue = (value: unknown): string => {
  if (value == null) return 'null:0:';
  const type = typeof value;
  const text = String(value);
  return `${type}:${text.length}:${text}`;
};

/** A fast independent 128-bit guard for the 32-bit cache lookup key. */
export const computeBaseReactFlowDisplayGeometryDigest = (
  input: BaseReactFlowDisplayInputIdentity,
): string => {
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const multipliers = [16777619, 2246822519, 3266489917, 668265263];
  const feed = (value: unknown): void => {
    const framed = digestValue(value);
    for (let index = 0; index < framed.length; index += 1) {
      const code = framed.charCodeAt(index);
      for (let lane = 0; lane < hashes.length; lane += 1) {
        hashes[lane] ^= code;
        hashes[lane] = Math.imul(hashes[lane], multipliers[lane]);
      }
    }
  };
  visitBaseReactFlowDisplayInputIdentity(input, feed);
  const digest = hashes
    .map(hash => (hash >>> 0).toString(16).padStart(8, '0'))
    .join('');
  return `geometry-v1:${digest}`;
};

export const isBaseReactFlowDisplayGeometryDigest = (value: unknown): value is string => (
  typeof value === 'string' && /^geometry-v1:[0-9a-f]{32}$/.test(value)
);
