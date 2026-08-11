import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

import { appModal } from '@/core/utils/antdStaticBridge';

interface UnsavedNavigationGuardCopy {
    title: string;
    content: string;
    confirm: string;
    keepEditing: string;
}

interface UseUnsavedNavigationGuardOptions {
    when: boolean;
    copy: UnsavedNavigationGuardCopy;
}

/**
 * Protects form state across every in-app route transition, including POP
 * navigation from the browser history controls.
 */
export const useUnsavedNavigationGuard = ({
    when,
    copy,
}: UseUnsavedNavigationGuardOptions): void => {
    const modalOpenRef = useRef(false);
    const blocker = useBlocker(({ currentLocation, nextLocation }) => (
        when && currentLocation.pathname !== nextLocation.pathname
    ));

    const blockerState = blocker.state;
    const proceed = blocker.state === 'blocked' ? blocker.proceed : undefined;
    const reset = blocker.state === 'blocked' ? blocker.reset : undefined;

    useEffect(() => {
        if (blockerState !== 'blocked' || !proceed || !reset || modalOpenRef.current) return;

        modalOpenRef.current = true;
        const activeElement = document.activeElement;
        const trigger = activeElement instanceof HTMLElement ? activeElement : null;
        let settled = false;
        let shouldRestoreFocus = true;

        const runOnce = (action: () => void) => {
            if (settled) return;
            settled = true;
            action();
        };

        const modal = appModal.confirm({
            title: copy.title,
            content: copy.content,
            okText: copy.confirm,
            cancelText: copy.keepEditing,
            autoFocusButton: 'cancel',
            okButtonProps: { danger: true },
            onOk: () => {
                shouldRestoreFocus = false;
                runOnce(proceed);
            },
            onCancel: () => runOnce(reset),
            afterClose: () => {
                if (shouldRestoreFocus && trigger?.isConnected) trigger.focus();
            },
        });

        return () => {
            modalOpenRef.current = false;
            modal?.destroy();
        };
    }, [
        blockerState,
        copy.confirm,
        copy.content,
        copy.keepEditing,
        copy.title,
        proceed,
        reset,
    ]);
};
