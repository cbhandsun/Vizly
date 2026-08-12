import { useCallback, useEffect, useRef, useState } from 'react';

export const TRANSIENT_STATUS_DURATION_MS = 4_000;
export const TRANSIENT_ACTION_STATUS_DURATION_MS = 12_000;

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
    const dismissDeadlineRef = useRef<number | null>(null);
    const remainingDurationRef = useRef<number | null>(null);

    const cancelDismissTimer = useCallback(() => {
        if (dismissTimerRef.current === null) return;
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
    }, []);

    const dismissStatus = useCallback(() => {
        dismissTimerRef.current = null;
        dismissDeadlineRef.current = null;
        remainingDurationRef.current = null;
        setStatus((current) => ({ ...current, action: null, message: '' }));
    }, []);

    const scheduleDismiss = useCallback((durationMs: number) => {
        dismissDeadlineRef.current = Date.now() + durationMs;
        remainingDurationRef.current = durationMs;
        dismissTimerRef.current = setTimeout(dismissStatus, durationMs);
    }, [dismissStatus]);

    const setStatusMessage = useCallback((message: string, action: TransientStatusAction | null = null) => {
        cancelDismissTimer();
        dismissDeadlineRef.current = null;
        remainingDurationRef.current = null;
        setStatus((current) => ({ action, message, version: current.version + 1 }));
        if (!message) return;

        scheduleDismiss(action ? TRANSIENT_ACTION_STATUS_DURATION_MS : TRANSIENT_STATUS_DURATION_MS);
    }, [cancelDismissTimer, scheduleDismiss]);

    const pauseStatusDismissal = useCallback(() => {
        if (dismissTimerRef.current === null || dismissDeadlineRef.current === null) return;
        remainingDurationRef.current = Math.max(0, dismissDeadlineRef.current - Date.now());
        cancelDismissTimer();
        dismissDeadlineRef.current = null;
    }, [cancelDismissTimer]);

    const resumeStatusDismissal = useCallback(() => {
        if (dismissTimerRef.current !== null || remainingDurationRef.current === null) return;
        if (remainingDurationRef.current <= 0) {
            dismissStatus();
            return;
        }
        scheduleDismiss(remainingDurationRef.current);
    }, [dismissStatus, scheduleDismiss]);

    useEffect(() => cancelDismissTimer, [cancelDismissTimer]);

    return {
        statusAction: status.action,
        statusMessage: status.message,
        statusMessageVersion: status.version,
        pauseStatusDismissal,
        resumeStatusDismissal,
        setStatusMessage,
    };
};
