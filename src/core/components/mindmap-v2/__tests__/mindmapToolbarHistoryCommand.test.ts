import type { MindElixirInstance } from 'mind-elixir';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggingHarness = vi.hoisted(() => ({
    historyFailure: vi.fn(),
}));

vi.mock('../mindmapToolbarLogging', () => ({
    logMindmapToolbarHistoryFailure: loggingHarness.historyFailure,
}));

import { runMindMapToolbarHistoryCommand } from '../mindmapToolbarHistoryCommand';

const createMind = () => ({
    redo: vi.fn(),
    undo: vi.fn(),
} as unknown as MindElixirInstance);

describe('runMindMapToolbarHistoryCommand', () => {
    beforeEach(() => {
        loggingHarness.historyFailure.mockReset();
    });

    it.each(['undo', 'redo'] as const)(
        'refreshes dependent toolbar state after a successful %s',
        action => {
            const mind = createMind();
            const onCommitted = vi.fn();

            runMindMapToolbarHistoryCommand(mind, action, onCommitted);

            expect(mind[action]).toHaveBeenCalledOnce();
            expect(onCommitted).toHaveBeenCalledOnce();
            expect(loggingHarness.historyFailure).not.toHaveBeenCalled();
        },
    );

    it('keeps dependent state unchanged and logs a redacted failure path', () => {
        const error = new Error('undo failed');
        const mind = createMind();
        mind.undo = vi.fn(() => { throw error; });
        const onCommitted = vi.fn();

        runMindMapToolbarHistoryCommand(mind, 'undo', onCommitted);

        expect(onCommitted).not.toHaveBeenCalled();
        expect(loggingHarness.historyFailure).toHaveBeenCalledWith('undo', error);
    });
});
