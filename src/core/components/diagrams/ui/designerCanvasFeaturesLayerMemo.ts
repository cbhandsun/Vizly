export interface PageTabsMemoState {
    items: unknown;
    activePageId: string;
    disabled?: boolean;
}

export const havePageTabsPropsChanged = (
    previous: PageTabsMemoState,
    next: PageTabsMemoState,
): boolean => (
    previous.items !== next.items
    || previous.activePageId !== next.activePageId
    || previous.disabled !== next.disabled
);
