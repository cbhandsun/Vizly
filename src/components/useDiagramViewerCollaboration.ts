import { useCallback, useRef, useState } from 'react';

import { resolveDiagramCollaborationStatus } from '@/core/components/diagrams/collaboration/collaborationStatus';
import { useYjsCollaboration } from './diagrams/collaboration/YjsProviderHooks';
import {
  normalizeCollaborationRoomName,
  normalizeCollaborationServerUrl,
  normalizeCollaborationToken,
} from './diagrams/collaboration/collaborationSecurity';
import {
  captureCollaborationModalFocus,
  scheduleCollaborationModalFocusRestore,
} from './collaborationModalFocus';

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
  const [collabModalVisible, setCollabModalVisibleState] = useState(false);
  const focusReturnTargetRef = useRef<HTMLElement | null>(null);
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
  const setCollabModalVisible = useCallback((open: boolean) => {
    if (open) {
      focusReturnTargetRef.current = captureCollaborationModalFocus();
      setCollabModalVisibleState(true);
      return;
    }

    setCollabModalVisibleState(false);
    const capturedTarget = focusReturnTargetRef.current;
    focusReturnTargetRef.current = null;
    scheduleCollaborationModalFocusRestore(capturedTarget);
  }, [setCollabModalVisibleState]);
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
