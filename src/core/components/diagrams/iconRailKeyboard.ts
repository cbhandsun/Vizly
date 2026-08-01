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
