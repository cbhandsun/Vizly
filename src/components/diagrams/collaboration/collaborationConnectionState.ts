import type { WebsocketProvider } from 'y-websocket';
import type { ActiveCollaborator } from './YjsProviderHooks';
import type { CollaborationAccess } from './collaborationAccessProtocol';
import type { CoordinationProblem } from '../../../../server/collaboration/coordinationStatus';

interface CollaborationConnectionSnapshot {
  provider: WebsocketProvider | null;
  synced: boolean;
  canWrite: boolean;
  accessRole: CollaborationAccess | null;
  activeUsers: ActiveCollaborator[];
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  coordinationProblem: CoordinationProblem | null;
}

export const createCollaborationConnectionState = () => {
  let snapshot: CollaborationConnectionSnapshot = {
    provider: null, synced: false, canWrite: false, accessRole: null, activeUsers: [], wsStatus: 'disconnected', coordinationProblem: null,
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update: (change: Partial<CollaborationConnectionSnapshot>) => {
      snapshot = { ...snapshot, ...change };
      listeners.forEach(listener => listener());
    },
  };
};
