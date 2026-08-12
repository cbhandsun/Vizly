import { useCallback, useEffect, useRef, useState } from 'react';

export const TRANSIENT_STATUS_DURATION_MS = 4_000;

interface TransientStatusState {
    message: string;
    version: number;
}

/**
 * Keeps operation feedback long enough to be perceived without permanently
 * consuming compact workspace UI. Versioning remounts identical live-region
 * messages so repeated operations are announced again.
 */
export const useTransientStatusMessage = () => {
    const [status, setStatus] = useState<TransientStatusState>({ message: '', version: 0 });
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancelDismissTimer = useCallback(() => {
        if (dismissTimerRef.current === null) return;
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
    }, []);

    const setStatusMessage = useCallback((message: string) => {
        cancelDismissTimer();
        setStatus((current) => ({ message, version: current.version + 1 }));
        if (!message) return;

        dismissTimerRef.current = setTimeout(() => {
            dismissTimerRef.current = null;
            setStatus((current) => ({ ...current, message: '' }));
        }, TRANSIENT_STATUS_DURATION_MS);
    }, [cancelDismissTimer]);

    useEffect(() => cancelDismissTimer, [cancelDismissTimer]);

    return {
        statusMessage: status.message,
        statusMessageVersion: status.version,
        setStatusMessage,
    };
};
