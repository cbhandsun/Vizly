import { useCallback, useSyncExternalStore } from 'react';
import { getFlowDataBridge } from '@vizly/core/diagram-data';
import { hasSupabaseCollaborationIdentity } from './diagrams/collaboration/collaborationCloudIdentity';

const readServerSnapshot = () => false;

/** Bridge registration and identity updates emit a scalar identity notification. */
export const useCloudCollaborationIdentity = (diagramId: string, enabled: boolean): boolean => {
  const readSnapshot = useCallback(() => enabled
    && hasSupabaseCollaborationIdentity(getFlowDataBridge(diagramId), diagramId), [diagramId, enabled]);
  const subscribe = useCallback((listener: () => void) => {
    if (!enabled || typeof window === 'undefined') return () => {};
    window.addEventListener('vizly:flow-data-bridge-identity', listener);
    return () => window.removeEventListener('vizly:flow-data-bridge-identity', listener);
  }, [enabled]);
  return useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);
};
