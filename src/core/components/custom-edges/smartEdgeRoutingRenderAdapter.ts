import { createContext, useContext } from 'react';

import {
  displayRoutingRenderAuthorityAllowsEdge,
  type DisplayRoutingRenderAuthority,
} from '../../routing/displayRoutingRenderAuthority';

export type SmartEdgeRoutingRenderAdapter = Readonly<{
  kind: 'standalone-fallback' | 'routing-session';
  acceptsCommittedGeometry: boolean;
  authority: DisplayRoutingRenderAuthority | null;
}>;

export const STANDALONE_EDGE_RENDER_ADAPTER: SmartEdgeRoutingRenderAdapter = Object.freeze({
  kind: 'standalone-fallback',
  acceptsCommittedGeometry: false,
  authority: null,
});

export const createRoutingSessionEdgeRenderAdapter = (
  authority: DisplayRoutingRenderAuthority,
): SmartEdgeRoutingRenderAdapter => Object.freeze({
  kind: 'routing-session',
  acceptsCommittedGeometry: true,
  authority,
});

export const resolveSmartEdgeRoutingRenderAdapter = (
  authority: DisplayRoutingRenderAuthority | null,
): SmartEdgeRoutingRenderAdapter => (
  authority ? createRoutingSessionEdgeRenderAdapter(authority) : STANDALONE_EDGE_RENDER_ADAPTER
);

/** Fail-closed authority for rendering routing-owned computedPath geometry. */
export const SmartEdgeRoutingRenderAdapterContext = createContext<SmartEdgeRoutingRenderAdapter>(
  STANDALONE_EDGE_RENDER_ADAPTER,
);

export const useSmartEdgeRoutingRenderAdapter = (): SmartEdgeRoutingRenderAdapter => (
  useContext(SmartEdgeRoutingRenderAdapterContext)
);

export const smartEdgeRenderAdapterAcceptsCommittedGeometry = (
  value: unknown,
  edgeId: unknown,
): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const adapter = value as Record<string, unknown>;
  return adapter.kind === 'routing-session'
    && adapter.acceptsCommittedGeometry === true
    && displayRoutingRenderAuthorityAllowsEdge(adapter.authority, edgeId);
};
