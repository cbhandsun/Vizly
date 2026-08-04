import type { DiagramCollaborationStatus } from '../../../types/diagram-components';

type CollaborationSocketStatus = Extract<
  DiagramCollaborationStatus,
  'connecting' | 'connected' | 'disconnected'
>;

export const resolveDiagramCollaborationStatus = (
  collaborationRequested: boolean,
  serverUrl: string,
  socketStatus: CollaborationSocketStatus,
): DiagramCollaborationStatus => {
  if (!collaborationRequested) return 'inactive';
  return serverUrl ? socketStatus : 'unavailable';
};
