import { useCallback, useEffect, useRef, useState } from 'react';

export const PAGE_TABS_STATUS_DURATION_MS = 4_000;

interface PageTabsStatusState {
    message: string;
    version: number;
}

/**
 * Keeps page-operation feedback long enough to be perceived without letting it
 * permanently consume narrow-canvas space. The version remounts the live-region
 * content so repeated identical operations are announced again.
 */
export const usePageTabsStatusMessage = () => {
    const [status, setStatus] = useState<PageTabsStatusState>({ message: '', version: 0 });
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
        }, PAGE_TABS_STATUS_DURATION_MS);
    }, [cancelDismissTimer]);

    useEffect(() => cancelDismissTimer, [cancelDismissTimer]);

    return {
        statusMessage: status.message,
        statusMessageVersion: status.version,
        setStatusMessage,
    };
};
