import type { KeyboardEvent, RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';

const POPOVER_OPEN_KEYS = new Set(['ArrowDown', 'Enter', ' ']);
const FOCUSABLE_CONTROL_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface KeyboardAccessiblePopoverOptions {
    contentRef: RefObject<HTMLElement | null>;
}

const focusFirstPopoverControl = (content: HTMLElement | null): boolean => {
    const focusTarget = content?.querySelector<HTMLElement>(FOCUSABLE_CONTROL_SELECTOR);
    if (!focusTarget) return false;
    focusTarget.focus({ preventScroll: true });
    return true;
};

export const useKeyboardAccessiblePopover = ({
    contentRef,
}: KeyboardAccessiblePopoverOptions) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const focusFirstControl = useCallback(() => {
        window.setTimeout(() => {
            focusFirstPopoverControl(contentRef.current);
        }, 0);
    }, [contentRef]);

    const restoreTriggerFocusIfLost = useCallback(() => {
        window.setTimeout(() => {
            const activeElement = document.activeElement;
            const focusStayedInClosingPopover = activeElement instanceof HTMLElement
                && contentRef.current?.contains(activeElement);
            const focusWasLost = !activeElement
                || activeElement === document.body
                || !activeElement.isConnected
                || focusStayedInClosingPopover;

            if (focusWasLost) triggerRef.current?.focus({ preventScroll: true });
        }, 0);
    }, [contentRef]);

    const closeAndRestoreFocus = useCallback(() => {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
    }, []);

    const handleTriggerKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
        if (!POPOVER_OPEN_KEYS.has(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
        focusFirstControl();
    }, [focusFirstControl]);

    const handleContentKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        closeAndRestoreFocus();
    }, [closeAndRestoreFocus]);

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            focusFirstControl();
            return;
        }
        restoreTriggerFocusIfLost();
    }, [focusFirstControl, restoreTriggerFocusIfLost]);

    return {
        closeAndRestoreFocus,
        handleContentKeyDown,
        handleOpenChange,
        handleTriggerKeyDown,
        open,
        triggerRef,
    };
};
