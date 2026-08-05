import { useCallback, useRef, useState } from 'react';

const MENU_OPEN_KEYS = new Set(['ArrowDown', 'Enter', ' ']);

interface KeyboardAccessibleDropdownOptions {
    overlayClassName: string;
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

    const handleTriggerKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!MENU_OPEN_KEYS.has(event.key)) return;
        event.preventDefault();
        setOpen(true);
        focusFirstItem();
    }, [focusFirstItem]);

    const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
    }, []);

    return {
        open,
        triggerRef,
        handleMenuKeyDown,
        handleOpenChange: setOpen,
        handleTriggerKeyDown,
    };
};
