import { compareCloudRevisions, parseCloudDiagramRevision } from '../../../../server/collaboration/cloudRevision';

/** Call only after the corresponding accepted canvas has committed. */
export const commitCollaborationCloudRevision = (
  bridge: { id?: string; metadata?: Record<string, unknown> }, diagramId: string, revision: unknown,
): boolean => {
  const accepted = parseCloudDiagramRevision(revision);
  const cloud = bridge.metadata?.cloud;
  if (!accepted || bridge.id !== diagramId || !cloud || typeof cloud !== 'object' || Array.isArray(cloud)) return false;
  const metadata = cloud as Record<string, unknown>;
  if (metadata.provider !== 'supabase' || metadata.id !== diagramId) return false;
  const previous = parseCloudDiagramRevision(metadata.revision);
  if (previous && compareCloudRevisions(accepted, previous) <= 0) return false;
  bridge.metadata = { ...bridge.metadata, cloud: { ...metadata, revision: accepted } };
  return true;
};
