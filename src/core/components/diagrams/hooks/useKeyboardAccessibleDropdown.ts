import { useCallback, useRef, useState } from 'react';

const MENU_OPEN_KEYS = new Set(['ArrowDown', 'Enter', ' ']);

interface KeyboardAccessibleDropdownOptions {
    overlayClassName: string;
}

interface DropdownOpenChangeInfo {
    source: 'trigger' | 'menu';
}

const focusFirstEnabledMenuItem = (overlayClassName: string): boolean => {
    const items = document.querySelectorAll<HTMLElement>(
        `.${overlayClassName} [role="menuitem"]`,
    );
    const firstEnabled = Array.from(items).find(item => (
        item.getAttribute('aria-disabled') !== 'true'
        && !item.hasAttribute('disabled')
    ));
    if (!firstEnabled) return false;
    firstEnabled.focus();
    return true;
};

export const useKeyboardAccessibleDropdown = ({
    overlayClassName,
}: KeyboardAccessibleDropdownOptions) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const focusFirstItem = useCallback(() => {
        window.setTimeout(() => {
            focusFirstEnabledMenuItem(overlayClassName);
        }, 0);
    }, [overlayClassName]);

    const restoreTriggerFocusIfLost = useCallback(() => {
        window.setTimeout(() => {
            const activeElement = document.activeElement;
            const overlay = document.querySelector(`.${overlayClassName}`);
            const focusStayedInClosingMenu = activeElement instanceof HTMLElement
                && overlay?.contains(activeElement);
            const focusWasLost = !activeElement
                || activeElement === document.body
                || !activeElement.isConnected
                || focusStayedInClosingMenu;

            if (focusWasLost) triggerRef.current?.focus();
        }, 0);
    }, [overlayClassName]);

    const handleTriggerKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!MENU_OPEN_KEYS.has(event.key)) return;
        event.preventDefault();
        setOpen(true);
        focusFirstItem();
    }, [focusFirstItem]);

    const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === ' ') {
            const target = event.target instanceof Element
                ? event.target.closest<HTMLElement>('[role="menuitem"]')
                : null;
            const isDisabled = target?.getAttribute('aria-disabled') === 'true'
                || target?.hasAttribute('disabled');
            if (!target || isDisabled) return;

            event.preventDefault();
            event.stopPropagation();
            target.click();
            return;
        }

        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
    }, []);

    const handleOpenChange = useCallback((nextOpen: boolean, info?: DropdownOpenChangeInfo) => {
        setOpen(nextOpen);
        if (!nextOpen && info?.source === 'menu') restoreTriggerFocusIfLost();
    }, [restoreTriggerFocusIfLost]);

    return {
        open,
        triggerRef,
        handleMenuKeyDown,
        handleOpenChange,
        handleTriggerKeyDown,
    };
};
