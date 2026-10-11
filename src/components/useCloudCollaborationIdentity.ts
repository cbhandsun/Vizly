import { useCallback, useSyncExternalStore } from 'react';
import { getFlowDataBridge } from '@vizly/core/diagram-data';
import { hasSupabaseCollaborationIdentity } from './diagrams/collaboration/collaborationCloudIdentity';

const readServerSnapshot = () => false;

/** The mutable bridge has no subscription API. Observe its scalar identity without touching canvas data. */
export const useCloudCollaborationIdentity = (diagramId: string, enabled: boolean): boolean => {
  const readSnapshot = useCallback(() => enabled
    && hasSupabaseCollaborationIdentity(getFlowDataBridge(diagramId), diagramId), [diagramId, enabled]);
  const subscribe = useCallback((listener: () => void) => {
    if (!enabled || typeof window === 'undefined') return () => {};
    // React checks the boolean snapshot before rendering; unchanged ticks do not rerender the viewer.
    const timer = window.setInterval(listener, 250);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);
};
