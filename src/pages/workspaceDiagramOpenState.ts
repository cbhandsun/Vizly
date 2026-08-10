import { coerceDiagramId } from '@/core/utils/inputBoundary';

import type { UnifiedDiagramItem } from './diagramManagementPage.helpers';

export type WorkspaceDiagramOpenStart =
  | { kind: 'started'; key: string }
  | { kind: 'duplicate'; key: string }
  | { kind: 'unkeyed' };

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const getWorkspaceDiagramOpenKey = (item: UnifiedDiagramItem): string | null => {
  const diagramId = coerceDiagramId(item.id) || coerceDiagramId(asRecord(item.raw).id);
  return diagramId ? `${item.source}:${diagramId}` : null;
};

export const beginWorkspaceDiagramOpen = (
  pendingKeys: Set<string>,
  item: UnifiedDiagramItem,
): WorkspaceDiagramOpenStart => {
  const key = getWorkspaceDiagramOpenKey(item);
  if (!key) return { kind: 'unkeyed' };
  if (pendingKeys.has(key)) return { kind: 'duplicate', key };
  pendingKeys.add(key);
  return { kind: 'started', key };
};

export const finishWorkspaceDiagramOpen = (
  pendingKeys: Set<string>,
  start: WorkspaceDiagramOpenStart,
): boolean => start.kind === 'started' && pendingKeys.delete(start.key);

export interface WorkspaceDiagramCreateLock {
  active: boolean;
}

export const beginWorkspaceDiagramCreate = (lock: WorkspaceDiagramCreateLock): boolean => {
  if (lock.active) return false;
  lock.active = true;
  return true;
};

export const finishWorkspaceDiagramCreate = (lock: WorkspaceDiagramCreateLock): boolean => {
  if (!lock.active) return false;
  lock.active = false;
  return true;
};
