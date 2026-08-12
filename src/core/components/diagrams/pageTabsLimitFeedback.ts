interface PageTabsLimitFeedbackOptions {
    pageLimitReached: boolean;
    disabled: boolean;
    announceLimit: () => void;
    performAction: () => void;
}

export const runPageTabsCapacityAction = ({
    pageLimitReached,
    disabled,
    announceLimit,
    performAction,
}: PageTabsLimitFeedbackOptions): void => {
    if (disabled) return;
    if (pageLimitReached) {
        announceLimit();
        return;
    }
    performAction();
};

export const getPageTabsCapacityControlState = (
    pageLimitReached: boolean,
    disabled: boolean,
): { ariaDisabled: boolean; disabled: boolean } => ({
    ariaDisabled: pageLimitReached || disabled,
    disabled,
});
