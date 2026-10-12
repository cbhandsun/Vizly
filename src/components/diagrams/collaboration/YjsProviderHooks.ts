import { useCallback, useEffect, useMemo, useState, useRef, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Node, Edge, useReactFlow } from '@xyflow/react';
import {
    normalizeCollaborationRoomName,
    normalizeCollaborationServerUrl,
    normalizeCollaborationToken,
} from './collaborationSecurity';
import { logUiStorageReadFailure, logUiStorageWriteFailure, safeLog } from '@vizly/core/logging';
import { parseCollaborationSnapshot } from './collaborationSnapshot';
import { publishCollaborationElement, readCollaborationElement } from '../../../../server/collaboration/documentModel';
import { createCollaborationConnectionState } from './collaborationConnectionState';
import { COLLABORATION_ACCESS_MESSAGE, readCollaborationAccess } from './collaborationAccessProtocol';
import { createCollaborationAwareness } from './collaborationAwareness';
import { resolveAuthenticatedCollaboratorIdentity } from './collaborationDisplayIdentity';
import { createCollaborationSocket } from './collaborationSocket';
import { COORDINATION_STATUS_MESSAGE, readCoordinationProblem } from '../../../../server/collaboration/coordinationStatus';
import { CLOUD_REVISION_MESSAGE, hasAcceptedCloudState, readAcceptedCloudRevision, type AcceptedCloudRevision } from '../../../../server/collaboration/cloudRevisionProtocol';

export const STORAGE_KEY_NAME = 'vizly_collaborator_name';
export const STORAGE_KEY_COLOR = 'vizly_collaborator_color';
const COLLABORATOR_COLORS = ['#f43f5e', '#f97316', '#eab308', '#10b981', '#0ea5e9', '#6366f1', '#d946ef'];

export interface CollaboratorIdentity {
    name: string;
    color: string;
}

export interface ActiveCollaborator {
    clientId: number;
    isLocal: boolean;
    user?: CollaboratorIdentity;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const parseCollaboratorIdentity = (value: unknown): CollaboratorIdentity | undefined => {
    if (!isRecord(value) || typeof value.name !== 'string' || typeof value.color !== 'string') {
        return undefined;
    }

    const name = value.name.trim().slice(0, 100);
    const color = value.color.trim().slice(0, 100);
    return name && color ? { name, color } : undefined;
};

const getRandomIndex = (max: number): number => {
    if (max <= 0) return 0;
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const value = new Uint32Array(1);
        crypto.getRandomValues(value);
        return value[0] % max;
    }
    return Math.floor(Math.random() * max);
};

export const readStoredCollaboratorIdentity = (): CollaboratorIdentity | null => {
    if (typeof sessionStorage === 'undefined') return null;
    try {
        const name = sessionStorage.getItem(STORAGE_KEY_NAME);
        const color = sessionStorage.getItem(STORAGE_KEY_COLOR);
        return name && color ? { name, color } : null;
    } catch (error) {
        logUiStorageReadFailure('YjsProviderHooks.readStoredCollaboratorIdentity', STORAGE_KEY_NAME, error);
        return null;
    }
};

const createCollaboratorIdentity = (): CollaboratorIdentity => ({
    name: `Guest ${getRandomIndex(1000)}`,
    color: COLLABORATOR_COLORS[getRandomIndex(COLLABORATOR_COLORS.length)] || COLLABORATOR_COLORS[0],
});

export const persistCollaboratorIdentity = (identity: CollaboratorIdentity): void => {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(STORAGE_KEY_NAME, identity.name);
        sessionStorage.setItem(STORAGE_KEY_COLOR, identity.color);
    } catch (error) {
        logUiStorageWriteFailure('YjsProviderHooks.persistCollaboratorIdentity', STORAGE_KEY_NAME, error);
        // Storage can be unavailable in private/embedded contexts; collaboration still works for this session.
    }
};

export interface YjsCollaborationOptions {
    userId?: string;
    roomName: string;
    serverUrl: string;
    token?: string;
    enabled?: boolean;
    onRemoteSnapshot?: (snapshot: { nodes: Node[]; edges: Edge[] }, cloudRevision?: string) => boolean;
    isLocalSnapshotReady?: () => boolean;
}

export function useYjsCollaboration(options: YjsCollaborationOptions) {
    const { roomName, serverUrl, token, userId, enabled = true, onRemoteSnapshot, isLocalSnapshotReady } = options;
    const reactFlowInstance = useReactFlow();
    
    const [connectionState] = useState(createCollaborationConnectionState);
    const { synced, activeUsers, wsStatus, provider, accessRole, coordinationProblem } = useSyncExternalStore(
        connectionState.subscribe, connectionState.getSnapshot, connectionState.getSnapshot,
    );
    const [connectionAttempt, setConnectionAttempt] = useState(0);
    const retryCollaboration = useCallback(() => setConnectionAttempt(attempt => attempt + 1), []);
    const connectionRef = useRef<{
        doc: Y.Doc;
        yNodes: Y.Map<unknown>;
        yEdges: Y.Map<unknown>;
        hasSynced: boolean;
    } | null>(null);
    const reactFlowRef = useRef(reactFlowInstance);
    const remoteSnapshotHandlerRef = useRef(onRemoteSnapshot);
    const localSnapshotReadinessRef = useRef(isLocalSnapshotReady);
    const pendingRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const remoteCommitFailureReportedRef = useRef(false);
    const pendingRemoteSnapshotRef = useRef<{
        doc: Y.Doc;
        snapshot: { nodes: Node[]; edges: Edge[] };
        cloudRevision?: string;
    } | null>(null);
    useEffect(() => {
        reactFlowRef.current = reactFlowInstance;
    }, [reactFlowInstance]);
    useEffect(() => {
        remoteSnapshotHandlerRef.current = onRemoteSnapshot;
    }, [onRemoteSnapshot]);
    useEffect(() => { localSnapshotReadinessRef.current = isLocalSnapshotReady; }, [isLocalSnapshotReady]);

    const flushPendingRemoteSnapshot = useCallback(() => {
        const pending = pendingRemoteSnapshotRef.current;
        if (!pending || connectionRef.current?.doc !== pending.doc || connectionState.getSnapshot().coordinationProblem) return false;
        try {
            const handler = remoteSnapshotHandlerRef.current;
            if (handler) {
                const committed = pending.cloudRevision === undefined
                    ? handler(pending.snapshot) : handler(pending.snapshot, pending.cloudRevision);
                if (!committed) return false;
            } else {
                reactFlowRef.current.setNodes(pending.snapshot.nodes);
                reactFlowRef.current.setEdges(pending.snapshot.edges);
            }
            pendingRemoteSnapshotRef.current = null;
            remoteCommitFailureReportedRef.current = false;
            return true;
        } catch {
            if (!remoteCommitFailureReportedRef.current) {
                safeLog.warn('[Collaboration] Remote canvas commit failed; pending snapshot retained.');
                remoteCommitFailureReportedRef.current = true;
            }
            return false;
        }
    }, [connectionState]);
    const retryPendingRemoteSnapshot = useCallback(function retry(): void {
        if (pendingRetryTimerRef.current !== null) clearTimeout(pendingRetryTimerRef.current);
        pendingRetryTimerRef.current = null;
        if (!flushPendingRemoteSnapshot() && pendingRemoteSnapshotRef.current) {
            pendingRetryTimerRef.current = setTimeout(retry, 100);
        }
    }, [flushPendingRemoteSnapshot]);
    const [storedLocalUser] = useState<CollaboratorIdentity>(() => {
        const storedIdentity = readStoredCollaboratorIdentity();
        if (storedIdentity) return storedIdentity;

        const nextIdentity = createCollaboratorIdentity();
        persistCollaboratorIdentity(nextIdentity);
        return nextIdentity;
    });
    const localUser = useMemo(() => resolveAuthenticatedCollaboratorIdentity(userId) ?? storedLocalUser,
        [userId, storedLocalUser]);

    // Capture owned JSON values so a later caller mutation cannot change the baseline.
    const lastSyncedNodesRef = useRef<Map<string, unknown>>(new Map());
    const lastSyncedEdgesRef = useRef<Map<string, unknown>>(new Map());

    useEffect(() => {
        connectionState.update({ synced: false, canWrite: false, accessRole: null, activeUsers: [], wsStatus: 'disconnected', provider: null, coordinationProblem: null });
        lastSyncedNodesRef.current.clear();
        lastSyncedEdgesRef.current.clear();
        pendingRemoteSnapshotRef.current = null;
        remoteCommitFailureReportedRef.current = false;
        if (pendingRetryTimerRef.current !== null) clearTimeout(pendingRetryTimerRef.current);
        pendingRetryTimerRef.current = null;
        const safeServerUrl = normalizeCollaborationServerUrl(serverUrl);
        if (!enabled || !safeServerUrl) return;
        
        const ydoc = new Y.Doc();
        const awareness = createCollaborationAwareness(ydoc);
        const safeToken = normalizeCollaborationToken(token);
        const safeRoomName = normalizeCollaborationRoomName(roomName);
        const wsParams = safeToken ? { params: { token: safeToken } } : {};
        
        let provider: WebsocketProvider;
        try {
            provider = new WebsocketProvider(safeServerUrl, safeRoomName, ydoc, {
                connect: true,
                disableBc: true,
                awareness,
                WebSocketPolyfill: createCollaborationSocket(),
                ...wsParams
            });
        } catch (error: unknown) {
            ydoc.destroy();
            throw error;
        }
            
        const yNodes = ydoc.getMap<unknown>('flowchart-nodes');
        const yEdges = ydoc.getMap<unknown>('flowchart-edges');
        connectionRef.current = { doc: ydoc, yNodes, yEdges, hasSynced: false };
        connectionState.update({ provider, wsStatus: 'connecting' });

        provider.awareness.setLocalStateField('user', {
            name: localUser.name,
            color: localUser.color
        });

        const isCurrentConnection = () => connectionRef.current?.doc === ydoc;
        let acceptedCloudRevision: AcceptedCloudRevision | null = null;
        const applyRemoteSnapshot = () => {
            if (!isCurrentConnection() || connectionState.getSnapshot().coordinationProblem) return;
            const snapshot = parseCollaborationSnapshot(yNodes.entries(), yEdges.entries());
            if (!snapshot) {
                safeLog.warn('[Collaboration] Rejected invalid remote canvas snapshot.');
                return;
            }
            pendingRemoteSnapshotRef.current = { doc: ydoc, snapshot,
                cloudRevision: acceptedCloudRevision && hasAcceptedCloudState(ydoc, acceptedCloudRevision)
                    ? acceptedCloudRevision.revision : undefined };
            retryPendingRemoteSnapshot();
        };
        provider.messageHandlers[CLOUD_REVISION_MESSAGE] = (_encoder, decoder, _provider, emitSynced) => {
            if (!emitSynced || !isCurrentConnection() || connectionState.getSnapshot().coordinationProblem) return;
            const accepted = readAcceptedCloudRevision(decoder);
            if (!accepted || !hasAcceptedCloudState(ydoc, accepted)) return;
            acceptedCloudRevision = accepted;
            applyRemoteSnapshot();
        };
        provider.messageHandlers[COLLABORATION_ACCESS_MESSAGE] = (_encoder, decoder, _provider, emitSynced) => {
            // Access claims are accepted only from the server transport, never BroadcastChannel peers.
            if (!emitSynced || !isCurrentConnection() || connectionState.getSnapshot().coordinationProblem) return;
            const access = readCollaborationAccess(decoder);
            connectionState.update({ canWrite: access === 'editor', accessRole: access ?? 'viewer' });
        };
        provider.messageHandlers[COORDINATION_STATUS_MESSAGE] = (_encoder, decoder, _provider, emitSynced) => {
            if (!emitSynced || !isCurrentConnection()) return;
            const problem = readCoordinationProblem(decoder);
            if (!problem) return;
            // Preserve the current canvas/document, but stop automatic retries
            // and publication until the user explicitly chooses recovery.
            provider.shouldConnect = false;
            pendingRemoteSnapshotRef.current = null;
            if (pendingRetryTimerRef.current !== null) clearTimeout(pendingRetryTimerRef.current);
            pendingRetryTimerRef.current = null;
            connectionState.update({ coordinationProblem: problem, canWrite: false, synced: false, wsStatus: 'disconnected' });
        };
        const handleSync = (isSynced: boolean) => {
            if (!isCurrentConnection() || connectionState.getSnapshot().coordinationProblem) return;
            if (isSynced && connectionRef.current) connectionRef.current.hasSynced = true;
            // A document with deletion history is authoritative even when its
            // maps are empty. An untouched new room can still be seeded locally.
            if (isSynced && Y.decodeStateVector(Y.encodeStateVector(ydoc)).size > 0) applyRemoteSnapshot();
            connectionState.update({ synced: isSynced });
        };
        provider.on('sync', handleSync);

        const handleStatus = (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
            if (isCurrentConnection() && connectionState.getSnapshot().coordinationProblem) {
                connectionState.update({ wsStatus: 'disconnected', canWrite: false, synced: false });
                return;
            }
            if (isCurrentConnection()) connectionState.update(event.status === 'connected'
                ? { wsStatus: event.status }
                : { wsStatus: event.status, canWrite: false, synced: false });
        };
        provider.on('status', handleStatus);

        const handleAwarenessChange = () => {
            if (!isCurrentConnection()) return;
            const states = Array.from(provider.awareness.getStates().entries());
            connectionState.update({ activeUsers: states.map(([clientId, state]) => ({
                clientId,
                isLocal: clientId === provider.awareness.clientID,
                user: parseCollaboratorIdentity(state.user),
            })) });
        };
        provider.awareness.on('change', handleAwarenessChange);
        // The local identity was set before subscribing; publish that initial state too.
        handleAwarenessChange();

        const handleRemoteElementChange = (_events: unknown, transaction: Y.Transaction) => {
            if (!transaction.local) applyRemoteSnapshot();
        };

        yNodes.observeDeep(handleRemoteElementChange);
        yEdges.observeDeep(handleRemoteElementChange);

        return () => {
            provider.off('sync', handleSync);
            provider.off('status', handleStatus);
            provider.awareness.off('change', handleAwarenessChange);
            yNodes.unobserveDeep(handleRemoteElementChange);
            yEdges.unobserveDeep(handleRemoteElementChange);
            connectionRef.current = null;
            pendingRemoteSnapshotRef.current = null;
            if (pendingRetryTimerRef.current !== null) clearTimeout(pendingRetryTimerRef.current);
            pendingRetryTimerRef.current = null;
            provider.destroy();
            ydoc.destroy();
        };
    }, [roomName, serverUrl, token, enabled, localUser, connectionState, retryPendingRemoteSnapshot, connectionAttempt]);

    const pushLocalChangesToYjs = (nodes: Node[], edges: Edge[]) => {
        const connection = connectionRef.current;
        if (!connection || !enabled) return;
        const { doc, yNodes, yEdges } = connection;
        if (pendingRemoteSnapshotRef.current?.doc === doc) {
            // A newly mounted canvas can still contain its pre-sync local state.
            // Commit the pending remote document before publishing any local state.
            flushPendingRemoteSnapshot();
            queueMicrotask(() => flushPendingRemoteSnapshot());
            return;
        }
        const access = connectionState.getSnapshot();
        // Yjs retains these operations across a transport reconnect. The server
        // reauthorizes every update; a prior editor claim never grants server access.
        const retainOfflineEdit = connection.hasSynced && access.accessRole === 'editor'
            && access.wsStatus !== 'connected' && !access.coordinationProblem;
        if ((!access.synced || !access.canWrite) && !retainOfflineEdit) return;
        try {
            if (localSnapshotReadinessRef.current && !localSnapshotReadinessRef.current()) return;
        } catch {
            safeLog.warn('[Collaboration] Canvas readiness check failed; local publication blocked.');
            return;
        }
        
        const snapshot = parseCollaborationSnapshot(
            nodes.map(node => [node.id, node] as [string, unknown]),
            edges.map(edge => [edge.id, edge] as [string, unknown]),
        );
        if (!snapshot) {
            safeLog.warn('[Collaboration] Invalid local snapshot; publication blocked.');
            return;
        }
        doc.transact(() => {
            // 1. Process Nodes
            const removedLocalNodeKeys = new Set(lastSyncedNodesRef.current.keys());
            const newNodesCache = new Map<string, unknown>();
            
            snapshot.nodes.forEach(n => {
                newNodesCache.set(n.id, readCollaborationElement(n));
                removedLocalNodeKeys.delete(n.id); // Only delete elements previously seen locally.
                
                const lastSynced = lastSyncedNodesRef.current.get(n.id);
                publishCollaborationElement(yNodes, n.id, n, lastSynced);
            });
            // Delete removed nodes
            removedLocalNodeKeys.forEach(k => yNodes.delete(k));
            lastSyncedNodesRef.current = newNodesCache; // Update cache

            // 2. Process Edges
            const removedLocalEdgeKeys = new Set(lastSyncedEdgesRef.current.keys());
            const newEdgesCache = new Map<string, unknown>();
            
            snapshot.edges.forEach(e => {
                newEdgesCache.set(e.id, readCollaborationElement(e));
                removedLocalEdgeKeys.delete(e.id);
                
                const lastSynced = lastSyncedEdgesRef.current.get(e.id);
                publishCollaborationElement(yEdges, e.id, e, lastSynced);
            });
            removedLocalEdgeKeys.forEach(k => yEdges.delete(k));
            lastSyncedEdgesRef.current = newEdgesCache; // Update cache
        });
    };

    return {
        isSynced: synced,
        provider,
        accessRole,
        activeUsers,
        wsStatus,
        coordinationProblem,
        retryCollaboration,
        pushLocalChangesToYjs,
    };
}
