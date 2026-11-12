import { getAuthSessionOwner, getAuthSessionRevision, onAuthSessionInvalidated } from '../context/authSessionBoundary';
import { localVersionDB } from '../services/IndexedDBStorage';
import { unifiedStorage, classifyVersionSaveFailure } from '../services/UnifiedStorageService';
import { VersionOutboxRunner } from '../services/versionOutboxRunner';
import { VERSION_AUTOSYNC_ENABLED } from '../services/versionOutboxPolicy';

/** Stopping this runtime leaves every persisted snapshot and pending task intact. */
export const installVersionOutbox = (enabled = VERSION_AUTOSYNC_ENABLED): (() => void) => {
    if (!enabled) return () => {};
    let providerRevision = 0;
    const runner = new VersionOutboxRunner({
        scope: () => {
            const ownerId = getAuthSessionOwner();
            return ownerId && navigator.onLine !== false && unifiedStorage.currentProviderId === 'supabase'
                && unifiedStorage.isConfigured()
                ? { ownerId, key: `${ownerId}:${getAuthSessionRevision()}:${providerRevision}` } : null;
        },
        list: owner => localVersionDB.listVersionOutbox(owner),
        load: task => localVersionDB.loadVersion(task.diagramId, task.versionId),
        upload: (task, version, signal) => {
            const provider = unifiedStorage.getProvider('supabase');
            if (!provider.saveVersionIdempotent) throw new Error('Storage configuration does not support idempotent versions');
            return provider.saveVersionIdempotent(task.diagramId, version.snapshotData, version.message, { ...task, signal });
        },
        complete: (task, remote) => localVersionDB.completeVersionOutbox(task, remote),
        fail: (task, next) => localVersionDB.updateVersionOutboxFailure(task, next),
        classify: classifyVersionSaveFailure,
        changed: () => window.dispatchEvent(new Event('version-history-changed')),
    });
    const unsubscribe = onAuthSessionInvalidated(runner.invalidate);
    const providerChanged = () => { providerRevision += 1; runner.invalidate(); };
    window.addEventListener('storage-provider-changed', providerChanged);
    window.addEventListener('online', runner.wake);
    window.addEventListener('offline', runner.invalidate);
    window.addEventListener('version-outbox-enqueued', runner.wake);
    runner.wake();
    return () => {
        runner.stop(); unsubscribe();
        window.removeEventListener('storage-provider-changed', providerChanged);
        window.removeEventListener('online', runner.wake);
        window.removeEventListener('offline', runner.invalidate);
        window.removeEventListener('version-outbox-enqueued', runner.wake);
    };
};
