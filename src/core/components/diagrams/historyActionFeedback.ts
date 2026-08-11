import { useCallback } from 'react';

export interface HistoryFeedbackPort {
    open: (config: {
        key: string;
        type: 'success';
        content: string;
        duration: number;
        pauseOnHover: false;
        style: {
            marginTop: number;
            pointerEvents: 'none';
        };
    }) => void;
}

const HISTORY_FEEDBACK_STYLE = {
    marginTop: 80,
    pointerEvents: 'none',
} as const;

export const runHistoryActionWithFeedback = (
    action: () => boolean,
    feedback: HistoryFeedbackPort,
    content: string,
): boolean => {
    const changed = action();
    if (!changed) return false;

    feedback.open({
        key: 'flowchart-history-feedback',
        type: 'success',
        content,
        duration: 2,
        pauseOnHover: false,
        style: HISTORY_FEEDBACK_STYLE,
    });
    return true;
};

export const useHistoryFeedbackActions = (
    undo: () => boolean,
    redo: () => boolean,
    feedback: HistoryFeedbackPort,
    undoContent: string,
    redoContent: string,
) => ({
    undo: useCallback(
        () => runHistoryActionWithFeedback(undo, feedback, undoContent),
        [feedback, undo, undoContent],
    ),
    redo: useCallback(
        () => runHistoryActionWithFeedback(redo, feedback, redoContent),
        [feedback, redo, redoContent],
    ),
});
