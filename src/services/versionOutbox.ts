import type { DiagramVersion, VersionSaveFailure } from './storage/types';

export const VERSION_OUTBOX_STORE = 'version_outbox';
export const MAX_VERSION_OUTBOX_TASKS = 512;
export const MAX_VERSION_OUTBOX_ATTEMPTS = 8;

export interface VersionOutboxTask {
    operationId: string;
    versionId: string;
    ownerId: string;
    provider: 'supabase';
    diagramId: string;
    payloadHash: string;
    attempts: number;
    nextAttemptAt: number;
    status: 'pending' | 'blocked';
    failure?: VersionSaveFailure;
}

export const failedVersionOutboxTask = (task: VersionOutboxTask, failure: VersionSaveFailure, now: number): VersionOutboxTask => {
    const attempts = Math.min(MAX_VERSION_OUTBOX_ATTEMPTS, task.attempts + 1);
    const blocked = attempts >= MAX_VERSION_OUTBOX_ATTEMPTS
        || !['network', 'unknown'].includes(failure);
    return { ...task, attempts, failure, status: blocked ? 'blocked' : 'pending',
        nextAttemptAt: blocked ? 0 : now + Math.min(300_000, 2_000 * 2 ** (attempts - 1)) };
};

/** Hash the normalized immutable upload, including the message, before opening IDB. */
export const hashVersionPayload = async (version: DiagramVersion): Promise<string> => {
    const serialized = JSON.stringify({
        diagramId: version.diagramId, snapshotData: version.snapshotData, message: version.message ?? null,
    }, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const createVersionOutboxTask = async (version: DiagramVersion): Promise<VersionOutboxTask> => {
    const storage = version.storage;
    if (!storage?.ownerId || storage.provider !== 'supabase' || !storage.localCreated
        || storage.location !== 'local' || storage.syncStatus !== 'pending' || !version.snapshotData) {
        throw new Error('Version is not eligible for automatic synchronization');
    }
    return {
        operationId: version.id, versionId: version.id, ownerId: storage.ownerId,
        provider: 'supabase', diagramId: version.diagramId, payloadHash: await hashVersionPayload(version),
        attempts: 0, nextAttemptAt: 0, status: 'pending',
    };
};
