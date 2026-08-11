import { describe, expect, it, vi } from 'vitest';
import {
    type HistoryFeedbackPort,
    runHistoryActionWithFeedback,
} from '../historyActionFeedback';

describe('runHistoryActionWithFeedback', () => {
    it('keeps successful history feedback below the toolbar and non-interactive', () => {
        const open = vi.fn<HistoryFeedbackPort['open']>();

        expect(runHistoryActionWithFeedback(() => true, { open }, 'Undo complete')).toBe(true);
        expect(open).toHaveBeenCalledWith({
            key: 'flowchart-history-feedback',
            type: 'success',
            content: 'Undo complete',
            duration: 2,
            pauseOnHover: false,
            style: {
                marginTop: 80,
                pointerEvents: 'none',
            },
        });
    });

    it('does not announce history feedback when the action changes nothing', () => {
        const open = vi.fn<HistoryFeedbackPort['open']>();

        expect(runHistoryActionWithFeedback(() => false, { open }, 'Nothing changed')).toBe(false);
        expect(open).not.toHaveBeenCalled();
    });
});
