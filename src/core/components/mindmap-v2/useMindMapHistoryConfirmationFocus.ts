import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const MINDMAP_HISTORY_CONFIRM_CANCEL_ID_PREFIX = 'mindmap-history-confirm-cancel-';

export const getMindMapHistoryConfirmCancelId = (key: string): string => {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || 'action';
    return `${MINDMAP_HISTORY_CONFIRM_CANCEL_ID_PREFIX}${safeKey}`;
};

export const useMindMapHistoryConfirmationFocus = (
    fallbackFocusRef: RefObject<HTMLElement | null>,
) => {
    const [confirmationKey, setConfirmationKey] = useState<string | null>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const focusFrameRef = useRef<number | null>(null);

    const cancelScheduledFocus = useCallback(() => {
        if (focusFrameRef.current === null) return;
        window.cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
    }, []);

    useEffect(() => cancelScheduledFocus, [cancelScheduledFocus]);

    const handleConfirmationOpenChange = useCallback((
        key: string,
        open: boolean,
        returnTarget: HTMLElement | null,
    ) => {
        cancelScheduledFocus();
        if (open) {
            returnFocusRef.current = returnTarget;
            setConfirmationKey(key);
            focusFrameRef.current = window.requestAnimationFrame(() => {
                focusFrameRef.current = null;
                document.getElementById(getMindMapHistoryConfirmCancelId(key))?.focus({
                    preventScroll: true,
                });
            });
            return;
        }

        setConfirmationKey(current => current === key ? null : current);
        const requestedTarget = returnFocusRef.current;
        focusFrameRef.current = window.requestAnimationFrame(() => {
            focusFrameRef.current = null;
            const focusTarget = requestedTarget?.isConnected
                ? requestedTarget
                : fallbackFocusRef.current;
            focusTarget?.focus({ preventScroll: true });
            returnFocusRef.current = null;
        });
    }, [cancelScheduledFocus, fallbackFocusRef]);

    return { confirmationKey, handleConfirmationOpenChange };
};
