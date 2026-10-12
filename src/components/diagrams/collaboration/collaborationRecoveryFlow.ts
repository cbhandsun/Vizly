import { CollaborationRecoveryError, type createCollaborationRecoveryClient } from './collaborationRecoveryClient';

export const restoreCloudCollaboration = async (options: {
  client: ReturnType<typeof createCollaborationRecoveryClient>;
  saveLocalCopy: () => Promise<string>;
  reconnect: () => void;
  signal: AbortSignal;
}) => {
  const current = () => { if (options.signal.aborted) throw new CollaborationRecoveryError('cancelled'); };
  current();
  const plan = await options.client.inspect(options.signal);
  current();
  const copyId = await options.saveLocalCopy();
  if (!copyId) throw new CollaborationRecoveryError('copyFailed');
  current();
  await options.client.recover(plan, options.signal);
  current();
  options.reconnect();
  return copyId;
};
