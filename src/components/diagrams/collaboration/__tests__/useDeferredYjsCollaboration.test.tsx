import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDeferredYjsCollaboration, type YjsCollaborationState } from '../useDeferredYjsCollaboration';
import type { YjsCollaborationOptions } from '../YjsProviderHooks';

const fixture = vi.hoisted(() => ({ mount: vi.fn(), dispose: vi.fn(), publish: vi.fn(), retry: vi.fn(), users: [] }));
vi.mock('../YjsCollaborationDriver', () => ({ default: function MockYjsDriver({ options, onState }: {
    options: YjsCollaborationOptions; onState: (value: YjsCollaborationState | null) => void;
}) {
    useEffect(() => {
        fixture.mount(options.roomName);
        onState({ isSynced: true, provider: null, accessRole: 'editor', activeUsers: fixture.users,
            wsStatus: 'connected', coordinationProblem: null,
            retryCollaboration: fixture.retry, pushLocalChangesToYjs: fixture.publish });
        return () => { fixture.dispose(options.roomName); onState(null); };
    }, [options.roomName, onState]);
    return null;
} }));

describe('deferred collaboration lifecycle', () => {
    it('loads only when enabled and prevents old-scope commands after switching or disabling', async () => {
        let current: ReturnType<typeof useDeferredYjsCollaboration> | undefined;
        const Harness = ({ options }: { options: YjsCollaborationOptions }) => {
            current = useDeferredYjsCollaboration(options);
            return current.collaborationRuntime;
        };
        const options = { roomName: 'room-a', serverUrl: 'wss://example.com', enabled: false };
        const view = render(<Harness options={options} />);
        expect(fixture.mount).not.toHaveBeenCalled();
        view.rerender(<Harness options={{ ...options, enabled: true }} />);
        await waitFor(() => expect(current?.isSynced).toBe(true));
        const oldPublish = current?.pushLocalChangesToYjs;
        act(() => oldPublish?.([], []));
        expect(fixture.publish).toHaveBeenCalledOnce();
        view.rerender(<Harness options={{ ...options, roomName: 'room-b', enabled: true }} />);
        await waitFor(() => expect(fixture.mount).toHaveBeenLastCalledWith('room-b'));
        act(() => oldPublish?.([], []));
        expect(fixture.publish).toHaveBeenCalledOnce();
        act(() => current?.pushLocalChangesToYjs([], []));
        expect(fixture.publish).toHaveBeenCalledTimes(2);
        const lastPublish = current?.pushLocalChangesToYjs;
        view.rerender(<Harness options={{ ...options, enabled: false }} />);
        expect(current?.isSynced).toBe(false);
        act(() => { lastPublish?.([], []); current?.retryCollaboration(); });
        expect(fixture.publish).toHaveBeenCalledTimes(2);
        expect(fixture.retry).not.toHaveBeenCalled();
        expect(fixture.dispose.mock.calls).toEqual([['room-a'], ['room-b']]);
        view.unmount();
    });
});
