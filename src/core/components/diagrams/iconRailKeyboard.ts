const ICON_RAIL_FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

interface IconRailTabEvent {
    key: string;
    shiftKey: boolean;
    preventDefault: () => void;
}

const getFocusableDrawerElements = (container: HTMLElement): HTMLElement[] => (
    Array.from(container.querySelectorAll<HTMLElement>(ICON_RAIL_FOCUSABLE_SELECTOR))
        .filter(element => (
            element.getAttribute('aria-hidden') !== 'true'
            && !element.closest('[hidden]')
        ))
);

export const focusIconRailDrawerEntry = (container: HTMLElement): boolean => {
    const preferred = container.querySelector<HTMLElement>('[data-icon-rail-initial-focus="true"]');
    const target = preferred ?? getFocusableDrawerElements(container)[0] ?? container;
    target.focus();
    return document.activeElement === target;
};

export const trapIconRailDrawerTab = (
    event: IconRailTabEvent,
    container: HTMLElement,
): boolean => {
    if (event.key !== 'Tab') return false;

    const focusable = getFocusableDrawerElements(container);
    if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return true;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    const shouldWrapBackward = event.shiftKey
        && (activeElement === first || !container.contains(activeElement));
    const shouldWrapForward = !event.shiftKey
        && (activeElement === last || !container.contains(activeElement));

    if (!shouldWrapBackward && !shouldWrapForward) return false;
    event.preventDefault();
    (shouldWrapBackward ? last : first).focus();
    return true;
};

export const bindIconRailEscapeClose = (
    target: Window,
    closeDrawer: () => void
): (() => void) => {
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;

        const eventTarget = event.target;
        const preservesDrawer = eventTarget instanceof Element
            && eventTarget.closest('[data-preserve-drawer-on-escape="true"]');
        if (!preservesDrawer) closeDrawer();
    };

    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
};
