export type ShareDialogTabKey = 'invite' | 'link';

const SHARE_DIALOG_TAB_ORDER: readonly ShareDialogTabKey[] = ['invite', 'link'];

const isShareDialogTabKey = (value: unknown): value is ShareDialogTabKey => (
    value === 'invite' || value === 'link'
);

export const resolveShareDialogTabKeyboardTarget = (
    key: unknown,
    activeTab: unknown,
): ShareDialogTabKey | null => {
    if (typeof key !== 'string' || !isShareDialogTabKey(activeTab)) {
        return null;
    }

    const currentIndex = SHARE_DIALOG_TAB_ORDER.indexOf(activeTab);
    if (key === 'Home') return SHARE_DIALOG_TAB_ORDER[0];
    if (key === 'End') return SHARE_DIALOG_TAB_ORDER[SHARE_DIALOG_TAB_ORDER.length - 1];
    if (key === 'ArrowRight') {
        return SHARE_DIALOG_TAB_ORDER[(currentIndex + 1) % SHARE_DIALOG_TAB_ORDER.length];
    }
    if (key === 'ArrowLeft') {
        return SHARE_DIALOG_TAB_ORDER[(currentIndex - 1 + SHARE_DIALOG_TAB_ORDER.length) % SHARE_DIALOG_TAB_ORDER.length];
    }
    return null;
};
