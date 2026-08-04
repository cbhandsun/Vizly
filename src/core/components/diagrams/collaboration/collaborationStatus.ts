import type { DiagramCollaborationStatus } from '../../../types/diagram-components';

type CollaborationSocketStatus = Extract<
  DiagramCollaborationStatus,
  'connecting' | 'connected' | 'disconnected'
>;

export const resolveDiagramCollaborationStatus = (
  roomFromUrl: string | null,
  serverUrl: string,
  socketStatus: CollaborationSocketStatus,
): DiagramCollaborationStatus => {
  if (!roomFromUrl) return 'inactive';
  return serverUrl ? socketStatus : 'unavailable';
};
