import type { Edge } from '@xyflow/react';
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';

import { EdgeRoutingCoordinator } from '../../services/EdgeRoutingCoordinator';

export type SmartEdgeRoutingOwner = 'edge' | 'canvas';

/**
 * Declares which layer owns expensive smart-edge routing for the current
 * React Flow tree. Standalone edge renderers keep edge-level routing by
 * default when they are mounted without BaseReactFlow.
 */
export const SmartEdgeRoutingOwnerContext = createContext<SmartEdgeRoutingOwner>('edge');

export const useSmartEdgeRoutingOwner = (): SmartEdgeRoutingOwner => (
  useContext(SmartEdgeRoutingOwnerContext)
);

export const createSmartEdgeRoutingLabelSignature = (edges: readonly Edge[]): string => (
  edges.map((edge) => {
    const data = (edge.data ?? {}) as Record<string, unknown>;
    const label = String(data.label ?? (edge as unknown as Record<string, unknown>).label ?? '');
    const position = data.labelPosition as { x?: number; y?: number } | undefined;
    return [
      edge.id,
      label,
      Math.round(Number(position?.x ?? data.absoluteLabelX ?? 0)),
      Math.round(Number(position?.y ?? data.absoluteLabelY ?? 0)),
    ].join(':');
  }).join('|')
);

/**
 * Subscribes to the edge-level coordinator only when it owns routing. Canvas
 * ownership must not instantiate the coordinator or its worker infrastructure.
 */
export const useSmartEdgeRoutingLease = (): {
  edgeOwnsRouting: boolean;
  graphVersion: number;
} => {
  const edgeOwnsRouting = useSmartEdgeRoutingOwner() === 'edge';
  const subscribeGraphVersion = useCallback((callback: () => void) => {
    if (!edgeOwnsRouting) return () => undefined;
    return EdgeRoutingCoordinator.getInstance().subscribeGraphVersion(callback);
  }, [edgeOwnsRouting]);
  const readGraphVersion = useCallback(
    () => edgeOwnsRouting ? EdgeRoutingCoordinator.getInstance().getGraphVersion() : 0,
    [edgeOwnsRouting],
  );
  const graphVersion = useSyncExternalStore(
    subscribeGraphVersion,
    readGraphVersion,
    () => 0,
  );
  return { edgeOwnsRouting, graphVersion };
};
