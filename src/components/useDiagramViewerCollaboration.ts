import { useCallback, useState } from 'react';

import { resolveDiagramCollaborationStatus } from '@/core/components/diagrams/collaboration/collaborationStatus';
import { useYjsCollaboration } from './diagrams/collaboration/YjsProviderHooks';
import {
  normalizeCollaborationRoomName,
  normalizeCollaborationServerUrl,
  normalizeCollaborationToken,
} from './diagrams/collaboration/collaborationSecurity';

interface UseDiagramViewerCollaborationOptions {
  cloudSyncEnabled: boolean;
  jwtToken?: string;
  roomFromUrl: string | null;
  selectedDiagramId: string;
}

export const useDiagramViewerCollaboration = ({
  cloudSyncEnabled,
  jwtToken,
  roomFromUrl,
  selectedDiagramId,
}: UseDiagramViewerCollaborationOptions) => {
  const serverUrl = normalizeCollaborationServerUrl(import.meta.env.VITE_YJS_WEBSOCKET_URL || '') || '';
  const [collabModalVisible, setCollabModalVisible] = useState(false);
  const roomName = normalizeCollaborationRoomName(roomFromUrl || `vizly-room-${selectedDiagramId}`);
  const wantsCollaboration = Boolean(roomFromUrl) || collabModalVisible || cloudSyncEnabled;
  const collaboration = useYjsCollaboration({
    roomName,
    serverUrl,
    token: normalizeCollaborationToken(jwtToken),
    enabled: Boolean(serverUrl) && wantsCollaboration,
  });
  const collaborationStatus = resolveDiagramCollaborationStatus(
    wantsCollaboration,
    serverUrl,
    collaboration.wsStatus,
  );
  const openCollaborationModal = useCallback(
    () => setCollabModalVisible(true),
    [setCollabModalVisible],
  );

  return {
    ...collaboration,
    collaborationStatus,
    collabModalVisible,
    openCollaborationModal,
    roomName,
    setCollabModalVisible,
  };
};
