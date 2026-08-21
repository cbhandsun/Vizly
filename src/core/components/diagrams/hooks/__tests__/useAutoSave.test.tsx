// @vitest-environment jsdom

import React, { useEffect } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAutoSavePayload } from '../../../../utils/autoSaveStorage';
import { useAutoSave } from '../useAutoSave';

const AutoSaveProbe: React.FC<{
    nodes: Node[];
    edges?: Edge[];
    storageKey?: string;
    diagramId?: string;
    routingVersion?: string;
    enabled?: boolean;
    onReady?: (api: ReturnType<typeof useAutoSave>) => void;
    getMetadata?: () => unknown;
}> = ({
    nodes,
    edges = [],
    storageKey = 'flowchart-autosave-v2-test',
    diagramId = 'test',
    routingVersion,
    enabled = false,
    onReady,
    getMetadata,
}) => {
    const api = useAutoSave(nodes, edges, {
        enabled,
        storageKey,
        diagramId,
        routingVersion,
        getMetadata,
    });

    useEffect(() => {
        onReady?.(api);
    }, [api, onReady]);

    return (
        <div>
            <span data-testid="saving">{String(api.saveState.saving)}</span>
            <span data-testid="error">{api.saveState.error || ''}</span>
            <span data-testid="last-saved">{api.saveState.lastSaved ?? ''}</span>
        </div>
    );
};

describe('useAutoSave', () => {
    afterEach(() => {
        vi.useRealTimers();
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
        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-test') || '{}'))
            .not.toHaveProperty('requiresRecoveryReview');
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

    it('persists and restores the routing version boundary', async () => {
        let api: ReturnType<typeof useAutoSave> | undefined;
        render(
            <AutoSaveProbe
                nodes={[{ id: 'versioned', position: { x: 0, y: 0 }, data: {} }]}
                routingVersion="routing-v-current"
                onReady={(nextApi) => { api = nextApi; }}
            />
        );

        await waitFor(() => expect(api).toBeDefined());
        await act(async () => { await api?.saveNow(); });

        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-test') || '{}'))
            .toMatchObject({ routingVersion: 'routing-v-current' });
        act(() => {
            expect(api?.loadSaved()).toMatchObject({ routingVersion: 'routing-v-current' });
        });
    });

    it('saves identical content when the active diagram scope changes', async () => {
        let api: ReturnType<typeof useAutoSave> | undefined;
        const nodes = [{ id: 'same', position: { x: 0, y: 0 }, data: {} }] satisfies Node[];
        const onReady = (nextApi: ReturnType<typeof useAutoSave>) => { api = nextApi; };
        const { rerender } = render(
            <AutoSaveProbe
                nodes={nodes}
                storageKey="flowchart-autosave-v2-a"
                diagramId="diagram-a"
                onReady={onReady}
            />
        );

        await waitFor(() => expect(api).toBeDefined());
        await act(async () => { await api?.saveNow(); });

        rerender(
            <AutoSaveProbe
                nodes={nodes}
                storageKey="flowchart-autosave-v2-b"
                diagramId="diagram-b"
                onReady={onReady}
            />
        );
        await act(async () => { await api?.saveNow(); });

        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-a') || '{}')).toMatchObject({
            diagramId: 'diagram-a',
        });
        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-b') || '{}')).toMatchObject({
            diagramId: 'diagram-b',
            nodes: [expect.objectContaining({ id: 'same' })],
        });
    });

    it('returns a one-time recovery marker and clears it from storage after load', async () => {
        const payload = createAutoSavePayload({
            diagramId: 'test',
            nodes: [{ id: 'restored', position: { x: 0, y: 0 }, data: {} }],
            edges: [],
            timestamp: Date.now(),
            requiresRecoveryReview: true,
        });
        expect(payload).not.toBeNull();
        localStorage.setItem('flowchart-autosave-v2-test', JSON.stringify(payload));

        let api: ReturnType<typeof useAutoSave> | undefined;
        render(
            <AutoSaveProbe
                nodes={payload?.nodes ?? []}
                onReady={(nextApi) => { api = nextApi; }}
            />
        );
        await waitFor(() => expect(api).toBeDefined());

        act(() => {
            expect(api?.loadSaved()).toMatchObject({ requiresRecoveryReview: true });
        });
        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-test') || '{}'))
            .not.toHaveProperty('requiresRecoveryReview');
    });

    it('synchronously saves the current diagram on beforeunload after a scope change', async () => {
        let api: ReturnType<typeof useAutoSave> | undefined;
        const nodes = [{ id: 'same', position: { x: 0, y: 0 }, data: {} }] satisfies Node[];
        const onReady = (nextApi: ReturnType<typeof useAutoSave>) => { api = nextApi; };
        const { rerender } = render(
            <AutoSaveProbe
                nodes={nodes}
                storageKey="flowchart-autosave-v2-a"
                diagramId="diagram-a"
                enabled
                onReady={onReady}
            />
        );

        await waitFor(() => expect(api).toBeDefined());
        await act(async () => { await api?.saveNow(); });
        rerender(
            <AutoSaveProbe
                nodes={nodes}
                storageKey="flowchart-autosave-v2-b"
                diagramId="diagram-b"
                enabled
                onReady={onReady}
            />
        );

        act(() => window.dispatchEvent(new Event('beforeunload')));

        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-b') || '{}')).toMatchObject({
            diagramId: 'diagram-b',
            nodes: [expect.objectContaining({ id: 'same' })],
            requiresRecoveryReview: true,
        });
    });

    it('does not rewrite an unchanged autosave immediately after restoring it', async () => {
        const payload = createAutoSavePayload({
            diagramId: 'test',
            nodes: [{ id: 'restored', position: { x: 0, y: 0 }, data: {} }],
            edges: [],
            timestamp: Date.now(),
        });
        expect(payload).not.toBeNull();
        localStorage.setItem('flowchart-autosave-v2-test', JSON.stringify(payload));

        let api: ReturnType<typeof useAutoSave> | undefined;
        render(
            <AutoSaveProbe
                nodes={[{ id: 'restored', position: { x: 0, y: 0 }, data: {} }]}
                onReady={(nextApi) => { api = nextApi; }}
            />
        );
        await waitFor(() => expect(api).toBeDefined());

        act(() => {
            expect(api?.loadSaved()).toMatchObject({ diagramId: 'test' });
        });
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
        await act(async () => { await api?.saveNow(); });

        expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('restores the persisted save timestamp and clears the visible state with the entry', async () => {
        const savedAt = Date.now() - 5_000;
        const payload = createAutoSavePayload({
            diagramId: 'test',
            nodes: [{ id: 'restored', position: { x: 0, y: 0 }, data: {} }],
            edges: [],
            timestamp: savedAt,
        });
        expect(payload).not.toBeNull();
        localStorage.setItem('flowchart-autosave-v2-test', JSON.stringify(payload));

        let api: ReturnType<typeof useAutoSave> | undefined;
        render(
            <AutoSaveProbe
                nodes={payload?.nodes ?? []}
                onReady={(nextApi) => { api = nextApi; }}
            />
        );
        await waitFor(() => expect(api).toBeDefined());

        act(() => {
            expect(api?.loadSaved()).toMatchObject({ timestamp: savedAt });
        });
        await waitFor(() => {
            expect(screen.getByTestId('last-saved').textContent).toBe(String(savedAt));
            expect(screen.getByTestId('error').textContent).toBe('');
        });

        act(() => api?.clearSaved());
        expect(localStorage.getItem('flowchart-autosave-v2-test')).toBeNull();
        await waitFor(() => {
            expect(screen.getByTestId('last-saved').textContent).toBe('');
            expect(screen.getByTestId('error').textContent).toBe('');
        });
    });

    it('shows a safe failure state when browser storage cannot be read', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('token=private-autosave-value');
        });

        let api: ReturnType<typeof useAutoSave> | undefined;
        render(
            <AutoSaveProbe
                nodes={[]}
                onReady={(nextApi) => { api = nextApi; }}
            />
        );
        await waitFor(() => expect(api).toBeDefined());

        act(() => {
            expect(api?.loadSaved()).toBeNull();
        });
        await waitFor(() => {
            expect(screen.getByTestId('last-saved').textContent).toBe('');
            expect(screen.getByTestId('error').textContent).toBe('auto-save-load-failed');
        });
        expect(screen.getByTestId('error').textContent).not.toContain('private-autosave-value');
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private-autosave-value');
    });

    it('cancels a failed diagram retry instead of writing into the next diagram scope', async () => {
        vi.useFakeTimers();
        const nativeSetItem = Storage.prototype.setItem;
        const writes: string[] = [];
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
            this: Storage,
            key: string,
            value: string,
        ) {
            writes.push(key);
            if (key === 'flowchart-autosave-v2-a') throw new Error('quota exceeded');
            nativeSetItem.call(this, key, value);
        });

        let api: ReturnType<typeof useAutoSave> | undefined;
        const onReady = (nextApi: ReturnType<typeof useAutoSave>) => { api = nextApi; };
        const { rerender } = render(
            <AutoSaveProbe
                nodes={[]}
                storageKey="flowchart-autosave-v2-a"
                diagramId="diagram-a"
                onReady={onReady}
            />
        );
        await act(async () => { await api?.saveNow(); });

        rerender(
            <AutoSaveProbe
                nodes={[]}
                storageKey="flowchart-autosave-v2-b"
                diagramId="diagram-b"
                onReady={onReady}
            />
        );
        await act(async () => {
            vi.advanceTimersByTime(1000);
            await Promise.resolve();
        });

        expect(writes).toEqual(['flowchart-autosave-v2-a']);
        await act(async () => { await api?.saveNow(); });
        expect(JSON.parse(localStorage.getItem('flowchart-autosave-v2-b') || '{}')).toMatchObject({
            diagramId: 'diagram-b',
        });
    });
});
