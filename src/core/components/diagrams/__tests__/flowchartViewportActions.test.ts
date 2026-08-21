// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readPersistedDiagramViewport } from '../../../utils/viewportPersistence';
import { runAndPersistViewportAction } from '../flowchartViewportActions';

describe('runAndPersistViewportAction', () => {
    beforeEach(() => sessionStorage.clear());

    it('waits for the programmatic action and persists its final viewport', async () => {
        const viewport = { x: -32, y: 16, zoom: 1 };
        const action = vi.fn(async () => true);

        await expect(runAndPersistViewportAction({
            action,
            getViewport: () => viewport,
            persistenceKey: 'diagram-a:page-1',
        })).resolves.toBe(true);
        expect(action).toHaveBeenCalledOnce();
        expect(readPersistedDiagramViewport(sessionStorage, 'diagram-a:page-1')).toEqual(viewport);
    });

    it('rejects invalid final viewport data', async () => {
        await expect(runAndPersistViewportAction({
            action: () => undefined,
            getViewport: () => ({ x: 0, y: 0, zoom: 0 }),
            persistenceKey: 'diagram-a:page-1',
        })).resolves.toBe(false);
        expect(sessionStorage.length).toBe(0);
    });

    it('does not persist when the programmatic action fails', async () => {
        await expect(runAndPersistViewportAction({
            action: () => Promise.reject(new Error('animation failed')),
            getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
            persistenceKey: 'diagram-a:page-1',
        })).rejects.toThrow('animation failed');
        expect(sessionStorage.length).toBe(0);
    });
});
