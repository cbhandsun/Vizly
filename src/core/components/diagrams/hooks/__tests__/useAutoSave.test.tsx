// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoSave } from '../useAutoSave';

const AutoSaveProbe: React.FC<{
    nodes: any[];
    edges?: any[];
    onReady?: (api: ReturnType<typeof useAutoSave>) => void;
    getMetadata?: () => unknown;
}> = ({ nodes, edges = [], onReady, getMetadata }) => {
    const api = useAutoSave(nodes, edges, {
        enabled: false,
        storageKey: 'flowchart-autosave-v2-test',
        diagramId: 'test',
        getMetadata,
    });

    useEffect(() => {
        onReady?.(api);
    }, [api, onReady]);

    return (
        <div>
            <span data-testid="saving">{String(api.saveState.saving)}</span>
            <span data-testid="error">{api.saveState.error || ''}</span>
        </div>
    );
};

describe('useAutoSave', () => {
    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('does not leave save state stuck when payload validation fails', async () => {
        let api: ReturnType<typeof useAutoSave> | undefined;
        render(
            <AutoSaveProbe
                nodes={[{ id: 'bad', position: { x: Number.POSITIVE_INFINITY, y: 0 }, data: {} }]}
                onReady={(nextApi) => { api = nextApi; }}
            />
        );

        await waitFor(() => expect(api).toBeDefined());

        await act(async () => {
            api?.saveNow();
        });

        await waitFor(() => {
            expect(screen.getByTestId('saving').textContent).toBe('false');
            expect(screen.getByTestId('error').textContent).toBe('Invalid auto-save payload');
        });
        expect(localStorage.getItem('flowchart-autosave-v2-test')).toBeNull();
    });

    it('saves valid payloads to localStorage', async () => {
        let api: ReturnType<typeof useAutoSave> | undefined;
        render(
            <AutoSaveProbe
                nodes={[{ id: 'ok', position: { x: 0, y: 0 }, data: { label: 'OK' } }]}
                onReady={(nextApi) => { api = nextApi; }}
            />
        );

        await waitFor(() => expect(api).toBeDefined());

        await act(async () => {
            api?.saveNow();
        });

        await waitFor(() => {
            expect(screen.getByTestId('saving').textContent).toBe('false');
        });
        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-test') || '{}')).toMatchObject({
            diagramId: 'test',
            nodes: [expect.objectContaining({ id: 'ok' })],
            version: '1.0',
        });
    });

    it('persists metadata-only changes instead of treating them as duplicate saves', async () => {
        let api: ReturnType<typeof useAutoSave> | undefined;
        let activePageId = 'page-1';
        const getMetadata = () => ({ multiPage: { version: 1, activePageId, pages: [] } });
        render(
            <AutoSaveProbe
                nodes={[]}
                getMetadata={getMetadata}
                onReady={(nextApi) => { api = nextApi; }}
            />
        );

        await waitFor(() => expect(api).toBeDefined());
        await act(async () => { api?.saveNow(); });
        activePageId = 'page-2';
        await act(async () => { api?.saveNow(); });

        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-test') || '{}')).toMatchObject({
            metadata: { multiPage: { activePageId: 'page-2' } },
        });
    });
});
