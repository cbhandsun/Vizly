import { getAuthSessionOwner, onAuthSessionInvalidated } from '../context/authSessionBoundary';

interface OutboxModule { installVersionOutbox(): () => void }

/** Keep storage/SDK imports off anonymous startup routes. The runtime scans on load. */
export const bootstrapVersionOutbox = (
    load: () => Promise<OutboxModule> = () => import('./configureVersionOutbox'),
    enabled = import.meta.env.VITE_VERSION_AUTOSYNC_ENABLED !== 'false',
): (() => void) => {
    if (!enabled) return () => {};
    let disposed = false;
    let loading = false;
    let stop: (() => void) | undefined;
    const start = () => {
        if (disposed || loading || stop || !getAuthSessionOwner()) return;
        loading = true;
        void load().then(module => {
            if (!disposed) stop = module.installVersionOutbox();
        }).catch(() => {
            // Leave persisted work intact. A later login/online event can retry loading.
        }).finally(() => { loading = false; });
    };
    const unsubscribe = onAuthSessionInvalidated(start);
    window.addEventListener('online', start);
    start();
    return () => {
        disposed = true;
        unsubscribe();
        window.removeEventListener('online', start);
        stop?.();
    };
};
