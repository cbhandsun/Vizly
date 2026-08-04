import { useCallback } from 'react';

export interface HistoryFeedbackPort {
    open: (config: {
        key: string;
        type: 'success';
        content: string;
        duration: number;
    }) => void;
}

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
