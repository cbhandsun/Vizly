import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';

import type { DisplayRoutingRenderAuthority } from '../../routing/displayRoutingRenderAuthority';
import {
  resolveSmartEdgeRoutingRenderAdapter,
  SmartEdgeRoutingRenderAdapterContext,
} from './smartEdgeRoutingRenderAdapter';

/**
 * Shared render-only boundary for Canvas and standalone custom edges.
 * It consumes a realm-issued Routing Session proof but never starts a Worker,
 * mutates a route, or writes a committed snapshot.
 */
export const RoutingSessionEdgeRenderProvider = ({
  authority,
  children,
}: PropsWithChildren<{
  authority: DisplayRoutingRenderAuthority | null;
}>) => {
  const adapter = useMemo(
    () => resolveSmartEdgeRoutingRenderAdapter(authority),
    [authority],
  );
  return (
    <SmartEdgeRoutingRenderAdapterContext.Provider value={adapter}>
      {children}
    </SmartEdgeRoutingRenderAdapterContext.Provider>
  );
};
