import type { Edge, Node } from '@xyflow/react';
import { areCollaborationElementsEqual, parseCollaborationSnapshot } from './collaborationSnapshot';
type Snapshot = { nodes: Node[]; edges: Edge[] };
interface Session { phase: 'preview' | 'resuming'; live: Snapshot }
const sessions = new Map<string, Session>();
const listeners = new Map<string, Set<() => void>>();
const persistenceLeases = new Map<string, Set<{ valid: boolean }>>();
const validId = (id: string) => typeof id === 'string' && id.length <= 256
  && /^[A-Za-z0-9_-][A-Za-z0-9._:/-]*$/.test(id)
  && id.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
const parse = (value: unknown): Snapshot | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) return null;
  const entries = (values: unknown[]): Array<[string, unknown]> => values.map(value => [
    value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : '', value,
  ]);
  const snapshot = parseCollaborationSnapshot(entries(record.nodes), entries(record.edges));
  if (!snapshot || new Set(snapshot.nodes.map(node => node.id)).size !== snapshot.nodes.length
    || new Set(snapshot.edges.map(edge => edge.id)).size !== snapshot.edges.length) return null;
  return snapshot;
};
const emit = (id: string) => { listeners.get(id)?.forEach(listener => listener()); };
const equal = (left: Snapshot, right: Snapshot) => {
  const elementsEqual = <T extends Node | Edge>(a: T[], b: T[]) => {
    if (a.length !== b.length) return false;
    const byId = new Map(b.map(element => [element.id, element]));
    return a.every(element => { const other = byId.get(element.id); return other !== undefined && areCollaborationElementsEqual(element, other); });
  };
  return elementsEqual(left.nodes, right.nodes) && elementsEqual(left.edges, right.edges);
};
export const areVersionPreviewSnapshotsEqual = (left: unknown, right: unknown): boolean => {
  const a = parse(left); const b = parse(right);
  return a !== null && b !== null && equal(a, b);
};
export const subscribeVersionPreview = (id: string, listener: () => void) => {
  const subscribers = listeners.get(id) ?? new Set();
  subscribers.add(listener); listeners.set(id, subscribers);
  return () => { subscribers.delete(listener); if (!subscribers.size) { listeners.delete(id); sessions.delete(id); } };
};
export const isVersionPreviewReadOnly = (id: string) => sessions.has(id);
export class VersionPreviewPersistenceError extends Error {
  constructor() { super('历史版本预览期间不能保存，请退出预览后重试'); this.name = 'VersionPreviewPersistenceError'; }
}
export const assertVersionPreviewPersistenceAllowed = (id: string): void => {
  if (!validId(id) || isVersionPreviewReadOnly(id)) throw new VersionPreviewPersistenceError();
};
/** Any preview entered while an async save is preparing invalidates that snapshot,
 * even when the preview has already ended by the time preparation finishes.
 */
export const withVersionPreviewPersistence = async <T>(id: string, action: (assertCurrent: () => void) => Promise<T>): Promise<T> => {
  assertVersionPreviewPersistenceAllowed(id);
  const lease = { valid: true };
  const leases = persistenceLeases.get(id) ?? new Set();
  leases.add(lease); persistenceLeases.set(id, leases);
  const assertCurrent = () => {
    assertVersionPreviewPersistenceAllowed(id);
    if (!lease.valid) throw new VersionPreviewPersistenceError();
  };
  try { return await action(assertCurrent); }
  finally { leases.delete(lease); if (!leases.size) persistenceLeases.delete(id); }
};
export const beginVersionPreview = (id: string, value: unknown): boolean => {
  const live = parse(value);
  if (!validId(id) || !live) return false;
  persistenceLeases.get(id)?.forEach(lease => { lease.valid = false; });
  const existing = sessions.get(id);
  if (!existing) sessions.set(id, { phase: 'preview', live });
  else existing.phase = 'preview';
  emit(id); return true;
};
/** The shared document stays live, while the historical canvas remains local. */
export const retainVersionPreviewRemote = (id: string, value: unknown): boolean => {
  const session = sessions.get(id);
  if (!session) return false;
  const snapshot = parse(value);
  if (!snapshot) throw new Error('Invalid preview live snapshot');
  session.live = snapshot;
  return session.phase === 'preview';
};
export const readVersionPreviewLive = (id: string): Snapshot | null => {
  const live = sessions.get(id)?.live;
  return live ? structuredClone(live) : null;
};
export const endVersionPreview = (id: string): Snapshot | null => {
  const session = sessions.get(id);
  if (!session) return null;
  session.phase = 'resuming'; emit(id);
  return structuredClone(session.live);
};
/** Keep stale preview renders blocked until the restored live snapshot is observed. */
export const canPublishVersionSnapshot = (id: string, value: unknown): boolean => {
  const session = sessions.get(id);
  if (!session) return true;
  if (session.phase === 'resuming') {
    const snapshot = parse(value);
    if (snapshot && equal(snapshot, session.live)) { sessions.delete(id); emit(id); }
  }
  return false;
};
export const discardVersionPreview = (id: string) => { if (sessions.delete(id)) emit(id); };
