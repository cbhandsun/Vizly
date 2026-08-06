import { useCallback, useRef, useState } from 'react';

const MENU_OPEN_KEYS = new Set(['ArrowDown', 'Enter', ' ']);
const MENU_ITEM_SELECTOR = [
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
].join(', ');

interface KeyboardAccessibleDropdownOptions {
    overlayClassName: string;
    onBeforeOpen?: () => void;
    preferredItemSelector?: string;
}

interface DropdownOpenChangeInfo {
    source: 'trigger' | 'menu';
}

const focusFirstEnabledMenuItem = (
    overlayClassName: string,
    preferredItemSelector?: string,
): boolean => {
    const overlay = document.querySelector<HTMLElement>(`.${overlayClassName}`);
    if (!overlay) return false;

    const enabledItems = Array.from(
        overlay.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR),
    ).filter(item => (
        item.getAttribute('aria-disabled') !== 'true'
        && !item.hasAttribute('disabled')
    ));
    const preferredItem = preferredItemSelector
        ? enabledItems.find(item => item.matches(preferredItemSelector))
        : undefined;
    const focusTarget = preferredItem ?? enabledItems[0];
    if (!focusTarget) return false;
    focusTarget.focus();
    return true;
};

export const useKeyboardAccessibleDropdown = ({
    overlayClassName,
    onBeforeOpen,
    preferredItemSelector,
}: KeyboardAccessibleDropdownOptions) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const focusFirstItem = useCallback(() => {
        window.setTimeout(() => {
            focusFirstEnabledMenuItem(overlayClassName, preferredItemSelector);
        }, 0);
    }, [overlayClassName, preferredItemSelector]);

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
        onBeforeOpen?.();
        setOpen(true);
        focusFirstItem();
    }, [focusFirstItem, onBeforeOpen]);

    const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === ' ') {
            const target = event.target instanceof Element
                ? event.target.closest<HTMLElement>(MENU_ITEM_SELECTOR)
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
        if (nextOpen) {
            onBeforeOpen?.();
            focusFirstItem();
        }
        setOpen(nextOpen);
        if (!nextOpen && info?.source === 'menu') restoreTriggerFocusIfLost();
    }, [focusFirstItem, onBeforeOpen, restoreTriggerFocusIfLost]);

    return {
        open,
        triggerRef,
        handleMenuKeyDown,
        handleOpenChange,
        handleTriggerKeyDown,
    };
};
