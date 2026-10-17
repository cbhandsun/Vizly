import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

import { resolveDiagramCollaborationStatus } from '@vizly/core/collaboration';
import { getFlowDataBridge } from '@vizly/core/diagram-data';
import type { Edge, Node } from '@xyflow/react';
import { useDeferredYjsCollaboration } from './diagrams/collaboration/useDeferredYjsCollaboration';
import { useCloudCollaborationIdentity } from './useCloudCollaborationIdentity';
import {
  normalizeCollaborationServerUrl,
  normalizeCollaborationToken,
} from './diagrams/collaboration/collaborationSecurity';
import { resolveCollaborationRoomBinding } from './diagrams/collaboration/collaborationRoomBinding';
import { preserveLocalCollaborationInteraction } from './diagrams/collaboration/collaborationLocalInteraction';
import { commitCollaborationCloudRevision } from './diagrams/collaboration/collaborationCloudRevision';
import { createCollaborationRecoveryClient, CollaborationRecoveryError } from './diagrams/collaboration/collaborationRecoveryClient';
import { restoreCloudCollaboration } from './diagrams/collaboration/collaborationRecoveryFlow';
import { saveDiagramViewerRecoveryCopy } from './diagramViewerRecoveryCopy';
import { canPublishVersionSnapshot, isVersionPreviewReadOnly, retainVersionPreviewRemote, subscribeVersionPreview } from './diagrams/collaboration/versionPreviewSession';
import {
  captureCollaborationModalFocus,
  scheduleCollaborationModalFocusRestore,
} from './collaborationModalFocus';

interface UseDiagramViewerCollaborationOptions {
  userId?: string;
  jwtToken?: string;
  roomFromUrl: string | null;
  selectedDiagramId: string;
}

export const useDiagramViewerCollaboration = ({
  userId,
  jwtToken,
  roomFromUrl,
  selectedDiagramId,
}: UseDiagramViewerCollaborationOptions) => {
  const serverUrl = normalizeCollaborationServerUrl(import.meta.env.VITE_YJS_WEBSOCKET_URL || '') || '';
  const [collabModalVisible, setCollabModalVisibleState] = useState(false);
  const focusReturnTargetRef = useRef<HTMLElement | null>(null);
  const roomBinding = resolveCollaborationRoomBinding(selectedDiagramId, roomFromUrl);
  const roomName = roomBinding.roomName;
  const [sessionRequest, setSessionRequest] = useState({ roomName, requested: false });
  if (sessionRequest.roomName !== roomName) {
    setSessionRequest({ roomName, requested: false });
    setCollabModalVisibleState(false);
  }
  // Existing cloud documents must recover accepted room state for every authorized tier.
  // Subscription entitlements govern cloud-save creation, not restoration or server roles.
  const cloudDocumentPresent = useCloudCollaborationIdentity(selectedDiagramId, Boolean(serverUrl));
  const wantsCollaboration = Boolean(roomFromUrl)
    || (sessionRequest.roomName === roomName && sessionRequest.requested) || cloudDocumentPresent;
  const subscribePreview = useCallback((listener: () => void) => subscribeVersionPreview(selectedDiagramId, listener), [selectedDiagramId]);
  const readPreview = useCallback(() => isVersionPreviewReadOnly(selectedDiagramId), [selectedDiagramId]);
  const canPersistCanvas = useCallback(() => !isVersionPreviewReadOnly(selectedDiagramId), [selectedDiagramId]);
  const previewReadOnly = useSyncExternalStore(subscribePreview, readPreview, readPreview);
  const recoveryContext = useMemo(() => ({ selectedDiagramId, jwtToken, serverUrl }), [selectedDiagramId, jwtToken, serverUrl]);
  const recoveryController = useRef<{ context: typeof recoveryContext; controller: AbortController } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); recoveryController.current = { context: recoveryContext, controller };
    return () => { controller.abort(); if (recoveryController.current?.controller === controller) recoveryController.current = null; };
  }, [recoveryContext]);
  const [recoveringContext, setRecoveringContext] = useState<typeof recoveryContext | null>(null);
  const recoveringOperation = useRef<AbortController | null>(null);
  const commitRemoteSnapshot = useCallback((snapshot: { nodes: Node[]; edges: Edge[] }, cloudRevision?: string) => {
    const bridge = getFlowDataBridge(selectedDiagramId);
    if (typeof bridge?.replaceCanvasSnapshot !== 'function' || bridge.isCanvasReady?.() !== true) return false;
    if (retainVersionPreviewRemote(selectedDiagramId, snapshot)) return cloudRevision === undefined;
    bridge.replaceCanvasSnapshot(preserveLocalCollaborationInteraction(snapshot,
      typeof bridge.getCanvasSnapshot === 'function' ? bridge.getCanvasSnapshot() : undefined));
    if (cloudRevision) commitCollaborationCloudRevision(bridge, selectedDiagramId, cloudRevision);
    setRecoveringContext(current => current === recoveryContext ? null : current);
    return true;
  }, [selectedDiagramId, recoveryContext]);
  const isLocalSnapshotReady = useCallback(() => getFlowDataBridge(selectedDiagramId)?.isCanvasReady?.() === true, [selectedDiagramId]);
  const collaborationEnabled = Boolean(serverUrl) && wantsCollaboration && roomBinding.valid;
  const collaboration = useDeferredYjsCollaboration({
    userId,
    roomName,
    serverUrl,
    token: normalizeCollaborationToken(jwtToken),
    enabled: collaborationEnabled,
    onRemoteSnapshot: commitRemoteSnapshot,
    isLocalSnapshotReady,
  });
  const collaborationStatus = resolveDiagramCollaborationStatus(
    wantsCollaboration,
    serverUrl,
    collaboration.wsStatus,
  );
  const recoveryReadOnly = recoveringContext === recoveryContext;
  const restoreCloudRoom = useCallback(async () => {
    const reservation = recoveryController.current;
    const recoveryScope = reservation?.context === recoveryContext ? reservation.controller : null;
    if (!recoveryScope || recoveryScope.signal.aborted || recoveringOperation.current === recoveryScope || !collaboration.coordinationProblem) throw new CollaborationRecoveryError('cancelled');
    recoveringOperation.current = recoveryScope;
    // Freeze the editor before capturing the durable recovery copy.
    flushSync(() => setRecoveringContext(recoveryContext));
    try {
      const client = createCollaborationRecoveryClient({ serverUrl, diagramId: selectedDiagramId, token: jwtToken ?? '' });
      await restoreCloudCollaboration({ client, signal: recoveryScope.signal,
        saveLocalCopy: () => saveDiagramViewerRecoveryCopy(selectedDiagramId), reconnect: collaboration.retryCollaboration,
      });
    } catch (error: unknown) {
      if (!recoveryScope.signal.aborted) setRecoveringContext(current => current === recoveryContext ? null : current);
      throw error;
    } finally { if (recoveringOperation.current === recoveryScope) recoveringOperation.current = null; }
  }, [recoveryContext, collaboration.coordinationProblem, collaboration.retryCollaboration, serverUrl, selectedDiagramId, jwtToken]);
  const publishLocalChanges = collaboration.pushLocalChangesToYjs;
  const pushLocalChangesToYjs = useCallback((nodes: Node[], edges: Edge[]) => {
    if (canPublishVersionSnapshot(selectedDiagramId, { nodes, edges })) publishLocalChanges(nodes, edges);
  }, [selectedDiagramId, publishLocalChanges]);
  const setCollabModalVisible = useCallback((open: boolean) => {
    if (open) {
      setSessionRequest({ roomName, requested: true });
      focusReturnTargetRef.current = captureCollaborationModalFocus();
      setCollabModalVisibleState(true);
      return;
    }

    setCollabModalVisibleState(false);
    const capturedTarget = focusReturnTargetRef.current;
    focusReturnTargetRef.current = null;
    scheduleCollaborationModalFocusRestore(capturedTarget);
  }, [roomName]);
  const openCollaborationModal = useCallback(
    () => setCollabModalVisible(true),
    [setCollabModalVisible],
  );

  return {
    ...collaboration,
    collaborationStatus,
    pushLocalChangesToYjs,
    isCollaborationReadOnly: (collaborationEnabled && collaboration.accessRole !== 'editor') || previewReadOnly || recoveryReadOnly,
    restoreCloudRoom,
    canPersistCanvas,
    collabModalVisible,
    openCollaborationModal,
    roomName,
    setCollabModalVisible,
  };
};
