import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { useYjsCollaboration, YjsCollaborationOptions } from './YjsProviderHooks';

export type YjsCollaborationState = ReturnType<typeof useYjsCollaboration>;
import { DeferredYjsDriver as Driver } from './DeferredYjsDriver';
let nextScope = 0;
const emptyState: YjsCollaborationState = {
    isSynced: false, provider: null, accessRole: null, activeUsers: [], wsStatus: 'disconnected',
    coordinationProblem: null, retryCollaboration: () => {}, pushLocalChangesToYjs: () => {},
};

/** Load Yjs only while a document actually requests collaboration. */
export const useDeferredYjsCollaboration = (options: YjsCollaborationOptions) => {
    const { roomName, serverUrl, token, userId, enabled = true } = options;
    const scope = useMemo(() => ({ id: ++nextScope, roomName, serverUrl, token, userId, enabled }), [roomName, serverUrl, token, userId, enabled]);
    const live = useRef<{ scope: typeof scope; state: YjsCollaborationState } | null>(null);
    const [snapshot, setSnapshot] = useState<{ scope: typeof scope; state: YjsCollaborationState } | null>(null);
    const onState = useCallback((state: YjsCollaborationState | null) => {
        if (!state) { if (live.current?.scope === scope) live.current = null; return; }
        live.current = { scope, state };
        setSnapshot(previous => previous?.scope === scope
            && previous.state.isSynced === state.isSynced && previous.state.provider === state.provider
            && previous.state.accessRole === state.accessRole && previous.state.activeUsers === state.activeUsers
            && previous.state.wsStatus === state.wsStatus && previous.state.coordinationProblem === state.coordinationProblem
            ? previous : { scope, state });
    }, [scope]);
    const retryCollaboration = useCallback(() => {
        if (enabled && live.current?.scope === scope) live.current.state.retryCollaboration();
    }, [enabled, scope]);
    const state = enabled && snapshot?.scope === scope ? snapshot.state : emptyState;
    const commandScope = useMemo(() => ({ scope, isSynced: state.isSynced,
        accessRole: state.accessRole, provider: state.provider }),
    [scope, state.isSynced, state.accessRole, state.provider]);
    const pushLocalChangesToYjs = useCallback((nodes: Node[], edges: Edge[]) => {
        if (enabled && live.current?.scope === commandScope.scope) live.current.state.pushLocalChangesToYjs(nodes, edges);
    }, [enabled, commandScope]);
    return { ...state, retryCollaboration, pushLocalChangesToYjs,
        collaborationRuntime: enabled
            ? <Suspense fallback={null}><Driver key={scope.id} options={options} onState={onState} /></Suspense>
            : null };
};
