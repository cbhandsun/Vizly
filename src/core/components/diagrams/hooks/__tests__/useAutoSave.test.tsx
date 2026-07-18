// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoSave } from '../useAutoSave';

const AutoSaveProbe: React.FC<{
    nodes: any[];
    edges?: any[];
    onReady?: (api: ReturnType<typeof useAutoSave>) => void;
}> = ({ nodes, edges = [], onReady }) => {
    const api = useAutoSave(nodes, edges, {
        enabled: false,
        storageKey: 'flowchart-autosave-v2-test',
        diagramId: 'test',
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
});
