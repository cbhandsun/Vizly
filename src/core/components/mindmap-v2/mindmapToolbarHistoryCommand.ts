import type { MindElixirInstance } from 'mind-elixir';

import { logMindmapToolbarHistoryFailure } from './mindmapToolbarLogging';

export const runMindMapToolbarHistoryCommand = (
    mind: MindElixirInstance,
    action: 'redo' | 'undo',
    onCommitted: () => void,
): void => {
    try {
        mind[action]();
        onCommitted();
    } catch (error) {
        logMindmapToolbarHistoryFailure(action, error);
    }
};
