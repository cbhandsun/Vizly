export const bindIconRailEscapeClose = (
    target: Window,
    closeDrawer: () => void
): (() => void) => {
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closeDrawer();
    };

    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
};
