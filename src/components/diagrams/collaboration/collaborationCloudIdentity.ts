const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const readOwnValue = (value: Record<string, unknown>, key: string): unknown =>
  Object.getOwnPropertyDescriptor(value, key)?.value;
const isUuid = (value: unknown): value is string => typeof value === 'string' && value.length === 36
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Connection demand only; the server still verifies identity and role. */
export const hasSupabaseCollaborationIdentity = (bridge: unknown, diagramId: unknown): boolean => {
  if (!isUuid(diagramId) || !isRecord(bridge) || readOwnValue(bridge, 'id') !== diagramId) return false;
  const metadata = readOwnValue(bridge, 'metadata');
  if (!isRecord(metadata)) return false;
  const cloud = readOwnValue(metadata, 'cloud');
  return isRecord(cloud) && readOwnValue(cloud, 'provider') === 'supabase'
    && readOwnValue(cloud, 'id') === diagramId;
};
