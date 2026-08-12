import { describe, expect, it, vi } from 'vitest';

import { getPageTabsCapacityControlState, runPageTabsCapacityAction } from '../pageTabsLimitFeedback';

describe('pageTabsLimitFeedback', () => {
    it('announces the page limit without performing the capacity action', () => {
        const announceLimit = vi.fn();
        const performAction = vi.fn();

        runPageTabsCapacityAction({ pageLimitReached: true, disabled: false, announceLimit, performAction });

        expect(announceLimit).toHaveBeenCalledOnce();
        expect(performAction).not.toHaveBeenCalled();
        expect(getPageTabsCapacityControlState(true, false)).toEqual({
            ariaDisabled: true,
            disabled: false,
        });
    });

    it('performs available actions and blocks globally disabled controls', () => {
        const announceLimit = vi.fn();
        const performAction = vi.fn();

        runPageTabsCapacityAction({ pageLimitReached: false, disabled: false, announceLimit, performAction });
        runPageTabsCapacityAction({ pageLimitReached: false, disabled: true, announceLimit, performAction });

        expect(performAction).toHaveBeenCalledOnce();
        expect(announceLimit).not.toHaveBeenCalled();
        expect(getPageTabsCapacityControlState(false, true)).toEqual({
            ariaDisabled: true,
            disabled: true,
        });
    });
});
