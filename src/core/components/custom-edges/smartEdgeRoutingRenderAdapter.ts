import { createContext, useContext } from 'react';

import {
  displayRoutingRenderAuthorityAllowsEdge,
  readDisplayRoutingRenderSessionContract,
  type DisplayRoutingRenderAuthority,
  type DisplayRoutingRenderEdgeClaim,
  type DisplayRoutingRenderSessionContract,
} from '../../routing/displayRoutingRenderAuthority';

export type SmartEdgeRoutingRenderAdapter =
  | Readonly<{
    kind: 'standalone-fallback';
    acceptsCommittedGeometry: false;
    authority: null;
    session: null;
  }>
  | Readonly<{
    kind: 'routing-session';
    acceptsCommittedGeometry: true;
    authority: DisplayRoutingRenderAuthority;
    session: DisplayRoutingRenderSessionContract;
  }>;

export const STANDALONE_EDGE_RENDER_ADAPTER: SmartEdgeRoutingRenderAdapter = Object.freeze({
  kind: 'standalone-fallback',
  acceptsCommittedGeometry: false,
  authority: null,
  session: null,
});

export const createRoutingSessionEdgeRenderAdapter = (
  authority: DisplayRoutingRenderAuthority,
): SmartEdgeRoutingRenderAdapter => {
  const session = readDisplayRoutingRenderSessionContract(authority);
  return session ? Object.freeze({
    kind: 'routing-session',
    acceptsCommittedGeometry: true,
    authority,
    session,
  }) : STANDALONE_EDGE_RENDER_ADAPTER;
};

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
  claim: DisplayRoutingRenderEdgeClaim,
): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const adapter = value as Record<string, unknown>;
  return adapter.kind === 'routing-session'
    && adapter.acceptsCommittedGeometry === true
    && adapter.session === readDisplayRoutingRenderSessionContract(adapter.authority)
    && displayRoutingRenderAuthorityAllowsEdge(adapter.authority, claim);
};
