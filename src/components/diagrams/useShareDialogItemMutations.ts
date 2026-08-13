import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { TFunction } from 'i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { logShareDialogMutationFailure } from '@/components/shareDialogLogging';
import { createShareDialogItemMutationGate } from '@/components/shareDialogItemMutationGate';
import {
  shareService,
  type CollaboratorRecord,
  type ShareRecord,
} from '@/services/ShareService';

interface ScopedRecords<T> {
  scopeKey: string | null;
  records: T[];
}

interface UseShareDialogItemMutationsOptions {
  collaborators: Dispatch<SetStateAction<ScopedRecords<CollaboratorRecord>>>;
  effectiveDiagramId: string;
  open: boolean;
  pendingCreatedSharesRef: MutableRefObject<ShareRecord[]>;
  scopeKey: string;
  shares: Dispatch<SetStateAction<ScopedRecords<ShareRecord>>>;
  t: TFunction;
}

export function useShareDialogItemMutations({
  collaborators: setCollaborators,
  effectiveDiagramId,
  open,
  pendingCreatedSharesRef,
  scopeKey,
  shares: setShares,
  t,
}: UseShareDialogItemMutationsOptions) {
  const gateRef = useRef(createShareDialogItemMutationGate());

  useEffect(() => () => {
    gateRef.current.invalidate();
  }, [effectiveDiagramId, open, scopeKey]);

  const handleRevokeShare = useCallback(async (shareId: string) => {
    if (!open) return;
    const token = gateRef.current.begin('revoke-share', shareId);
    if (!token) return;
    try {
      await shareService.revokeShare(shareId);
      if (!gateRef.current.isCurrent(token)) return;
      appMessage.success(t('share.revoked'));
      pendingCreatedSharesRef.current = pendingCreatedSharesRef.current.filter(
        share => share.id !== shareId,
      );
      setShares(previous => previous.scopeKey === scopeKey
        ? { ...previous, records: previous.records.filter(share => share.id !== shareId) }
        : previous);
    } catch (error) {
      if (!gateRef.current.isCurrent(token)) return;
      logShareDialogMutationFailure('revokeShare', error);
      appMessage.error(t('share.revokeFailed'));
    } finally {
      gateRef.current.finish(token);
    }
  }, [open, pendingCreatedSharesRef, scopeKey, setShares, t]);

  const handleRemoveCollaborator = useCallback(async (targetUserId: string) => {
    if (!open) return;
    const token = gateRef.current.begin('remove-collaborator', targetUserId);
    if (!token) return;
    try {
      await shareService.removeCollaborator(effectiveDiagramId, targetUserId);
      if (!gateRef.current.isCurrent(token)) return;
      appMessage.success(t('share.removeSuccess'));
      setCollaborators(previous => previous.scopeKey === scopeKey
        ? {
          ...previous,
          records: previous.records.filter(
            collaborator => collaborator.user_id !== targetUserId,
          ),
        }
        : previous);
    } catch (error) {
      if (!gateRef.current.isCurrent(token)) return;
      logShareDialogMutationFailure('removeCollaborator', error);
      appMessage.error(t('share.removeFailed'));
    } finally {
      gateRef.current.finish(token);
    }
  }, [effectiveDiagramId, open, scopeKey, setCollaborators, t]);

  return {
    handleRemoveCollaborator,
    handleRevokeShare,
  };
}
