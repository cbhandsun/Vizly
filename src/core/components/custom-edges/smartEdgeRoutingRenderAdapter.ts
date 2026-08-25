import { createContext, useContext } from 'react';

import {
  EDGE_ROUTING_CACHE_VERSION,
  EDGE_ROUTING_VISUAL_VERSION,
} from '../../routing/routingVersion';

export type SmartEdgeRoutingRenderAdapter = Readonly<{
  kind: 'standalone-fallback' | 'routing-session';
  acceptsCommittedGeometry: boolean;
  routingVersion: string | null;
  qualityContract: 'none' | typeof EDGE_ROUTING_VISUAL_VERSION;
}>;

export const STANDALONE_EDGE_RENDER_ADAPTER: SmartEdgeRoutingRenderAdapter = Object.freeze({
  kind: 'standalone-fallback',
  acceptsCommittedGeometry: false,
  routingVersion: null,
  qualityContract: 'none',
});

export const ROUTING_SESSION_EDGE_RENDER_ADAPTER: SmartEdgeRoutingRenderAdapter = Object.freeze({
  kind: 'routing-session',
  acceptsCommittedGeometry: true,
  routingVersion: EDGE_ROUTING_CACHE_VERSION,
  qualityContract: EDGE_ROUTING_VISUAL_VERSION,
});

/** Fail-closed authority for rendering routing-owned computedPath geometry. */
export const SmartEdgeRoutingRenderAdapterContext = createContext<SmartEdgeRoutingRenderAdapter>(
  STANDALONE_EDGE_RENDER_ADAPTER,
);

export const useSmartEdgeRoutingRenderAdapter = (): SmartEdgeRoutingRenderAdapter => (
  useContext(SmartEdgeRoutingRenderAdapterContext)
);

export const smartEdgeRenderAdapterAcceptsCommittedGeometry = (
  value: unknown,
): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const adapter = value as Record<string, unknown>;
  return adapter.kind === 'routing-session'
    && adapter.acceptsCommittedGeometry === true
    && adapter.routingVersion === EDGE_ROUTING_CACHE_VERSION
    && adapter.qualityContract === EDGE_ROUTING_VISUAL_VERSION;
};
