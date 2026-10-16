import type { CollaboratorIdentity } from './YjsProviderHooks';

/** Display only: the server still authenticates and authorizes every connection. */
export const resolveAuthenticatedCollaboratorIdentity = (userId: unknown): CollaboratorIdentity | null => {
  if (typeof userId !== 'string' || userId.length !== 36
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
  return { name: `User ${userId.slice(0, 8).toLowerCase()}`, color: '#0ea5e9' };
};
