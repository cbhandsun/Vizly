import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
    safeLog: safeLogState,
}));

describe('diagramHostStorageLogging', () => {
    afterEach(() => {
        Object.values(safeLogState).forEach(mock => mock.mockReset());
        vi.restoreAllMocks();
    });

    it('redacts storage read and write failures', async () => {
        const logging = await import('../diagramHostStorageLogging');

        logging.logDiagramHostStorageReadFailure('diagramMenu.recent', new Error('Authorization: Bearer recent-secret'));
        logging.logDiagramHostStorageWriteFailure('diagramMenu.favorites', new Error('cookie=favorites-secret'));

        const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
        const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

        expect(warnMessages).toContain('[diagramHostStorage] Failed to read "diagramMenu.recent":');
        expect(warnMessages).toContain('[diagramHostStorage] Failed to write "diagramMenu.favorites":');
        expect(warnPayload).toContain('[redacted]');
        expect(warnPayload).not.toContain('recent-secret');
        expect(warnPayload).not.toContain('favorites-secret');
    });
});
