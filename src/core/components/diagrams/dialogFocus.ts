const DIALOG_FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

interface DialogTabEvent {
    key: string;
    shiftKey: boolean;
    preventDefault: () => void;
}

const getFocusableDialogElements = (container: HTMLElement): HTMLElement[] => (
    Array.from(container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR))
        .filter(element => (
            element.getAttribute('aria-hidden') !== 'true'
            && !element.closest('[aria-hidden="true"]')
            && !element.closest('[hidden]')
        ))
);

export const findExpandedDialogTrigger = (
    root: ParentNode,
    dialog: HTMLElement,
): HTMLElement | null => (
    Array.from(root.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"][aria-expanded="true"]'))
        .find(element => element.isConnected && !dialog.contains(element))
    ?? null
);

export const focusDialogEntry = (container: HTMLElement): boolean => {
    const preferred = container.querySelector<HTMLElement>('[data-dialog-initial-focus="true"]');
    const target = preferred ?? getFocusableDialogElements(container)[0] ?? container;
    target.focus();
    return document.activeElement === target;
};

export const trapDialogTab = (
    event: DialogTabEvent,
    container: HTMLElement,
): boolean => {
    if (event.key !== 'Tab') return false;

    const focusable = getFocusableDialogElements(container);
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

export const bindDialogEscapeClose = (
    target: Window,
    closeDialog: () => void,
): (() => void) => {
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;

        const eventTarget = event.target;
        const preservesDialog = eventTarget instanceof Element
            && eventTarget.closest('[data-preserve-dialog-on-escape="true"]');
        if (!preservesDialog) closeDialog();
    };

    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
};
