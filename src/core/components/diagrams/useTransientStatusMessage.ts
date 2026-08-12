import { useCallback, useEffect, useRef, useState } from 'react';

export const TRANSIENT_STATUS_DURATION_MS = 4_000;

interface TransientStatusState {
    action: TransientStatusAction | null;
    message: string;
    version: number;
}

export interface TransientStatusAction {
    label: string;
    onActivate: () => void;
}

/**
 * Keeps operation feedback long enough to be perceived without permanently
 * consuming compact workspace UI. Versioning remounts identical live-region
 * messages so repeated operations are announced again.
 */
export const useTransientStatusMessage = () => {
    const [status, setStatus] = useState<TransientStatusState>({ action: null, message: '', version: 0 });
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancelDismissTimer = useCallback(() => {
        if (dismissTimerRef.current === null) return;
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
    }, []);

    const setStatusMessage = useCallback((message: string, action: TransientStatusAction | null = null) => {
        cancelDismissTimer();
        setStatus((current) => ({ action, message, version: current.version + 1 }));
        if (!message) return;

        dismissTimerRef.current = setTimeout(() => {
            dismissTimerRef.current = null;
            setStatus((current) => ({ ...current, action: null, message: '' }));
        }, TRANSIENT_STATUS_DURATION_MS);
    }, [cancelDismissTimer]);

    useEffect(() => cancelDismissTimer, [cancelDismissTimer]);

    return {
        statusAction: status.action,
        statusMessage: status.message,
        statusMessageVersion: status.version,
        setStatusMessage,
    };
};
