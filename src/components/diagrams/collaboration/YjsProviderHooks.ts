import { useEffect, useState, useMemo, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Node, Edge, useReactFlow } from '@xyflow/react';
import { Awareness } from 'y-protocols/awareness';

export interface YjsCollaborationOptions {
    roomName: string;
    serverUrl: string;
    token?: string;
    enabled?: boolean;
}

export function useYjsCollaboration(options: YjsCollaborationOptions) {
    const { roomName, serverUrl, token, enabled = true } = options;
    const reactFlowInstance = useReactFlow();
    
    const [synced, setSynced] = useState(false);
    const [activeUsers, setActiveUsers] = useState<any[]>([]);
    const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

    // GAP-02: Collaboration Optimization. Track references instead of stringifying everything
    const lastSyncedNodesRef = useRef<Map<string, Node>>(new Map());
    const lastSyncedEdgesRef = useRef<Map<string, Edge>>(new Map());
    
    const { doc, provider, yNodes, yEdges } = useMemo(() => {
        if (!enabled || !serverUrl) return { doc: null, provider: null, yNodes: null, yEdges: null };
        
        const ydoc = new Y.Doc();
        const wsParams = token ? { params: { token } } : {};
        
        const yProvider = new WebsocketProvider(serverUrl, roomName, ydoc, {
            connect: true,
            ...wsParams
        });
            
        const nodesMap = ydoc.getMap<Node>('flowchart-nodes');
        const edgesMap = ydoc.getMap<Edge>('flowchart-edges');

        // Setup random user color and initial state for cursor
        const colors = ['#f43f5e', '#f97316', '#eab308', '#10b981', '#0ea5e9', '#6366f1', '#d946ef'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        yProvider.awareness.setLocalStateField('user', {
            name: 'Guest ' + Math.floor(Math.random() * 1000),
            color: randomColor
        });

        return { doc: ydoc, provider: yProvider, yNodes: nodesMap, yEdges: edgesMap };
    }, [roomName, serverUrl, token, enabled]);

    useEffect(() => {
        if (!provider || !yNodes || !yEdges) return;

        const handleSync = (isSynced: boolean) => setSynced(isSynced);
        provider.on('sync', handleSync);

        const handleStatus = (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
            setWsStatus(event.status);
        };
        provider.on('status', handleStatus);

        const handleAwarenessChange = () => {
            const states = Array.from(provider.awareness.getStates().entries());
            setActiveUsers(states.map(([clientId, state]) => ({ clientId, ...state })));
        };
        provider.awareness.on('change', handleAwarenessChange);

        const handleRemoteNodeChange = (event: Y.YMapEvent<Node>) => {
            if (event.transaction.local) return;
            reactFlowInstance.setNodes(currentNodes => {
                const nextNodes = [...currentNodes];
                event.changes.keys.forEach((change, key) => {
                    if (change.action === 'add' || change.action === 'update') {
                        const newElement = yNodes.get(key);
                        if (!newElement) return;
                        const idx = nextNodes.findIndex(n => n.id === key);
                        if (idx > -1) nextNodes[idx] = newElement;
                        else nextNodes.push(newElement);
                    } else if (change.action === 'delete') {
                        const idx = nextNodes.findIndex(n => n.id === key);
                        if (idx > -1) nextNodes.splice(idx, 1);
                    }
                });
                return nextNodes;
            });
        };

        const handleRemoteEdgeChange = (event: Y.YMapEvent<Edge>) => {
            if (event.transaction.local) return;
            reactFlowInstance.setEdges(currentEdges => {
                const nextEdges = [...currentEdges];
                event.changes.keys.forEach((change, key) => {
                    if (change.action === 'add' || change.action === 'update') {
                        const newElement = yEdges.get(key);
                        if (!newElement) return;
                        const idx = nextEdges.findIndex(e => e.id === key);
                        if (idx > -1) nextEdges[idx] = newElement;
                        else nextEdges.push(newElement);
                    } else if (change.action === 'delete') {
                        const idx = nextEdges.findIndex(e => e.id === key);
                        if (idx > -1) nextEdges.splice(idx, 1);
                    }
                });
                return nextEdges;
            });
        };

        yNodes.observe(handleRemoteNodeChange);
        yEdges.observe(handleRemoteEdgeChange);

        return () => {
            provider.off('sync', handleSync);
            provider.off('status', handleStatus);
            provider.awareness.off('change', handleAwarenessChange);
            yNodes.unobserve(handleRemoteNodeChange);
            yEdges.unobserve(handleRemoteEdgeChange);
            provider.destroy();
            doc?.destroy();
        };
    }, [provider, yNodes, yEdges, reactFlowInstance, doc]);

    const pushLocalChangesToYjs = (nodes: Node[], edges: Edge[]) => {
        if (!doc || !yNodes || !yEdges || !enabled) return;
        
        doc.transact(() => {
            // 1. Process Nodes
            const currentYNodeKeys = new Set(yNodes.keys());
            const newNodesCache = new Map<string, Node>();
            
            nodes.forEach(n => {
                newNodesCache.set(n.id, n);
                currentYNodeKeys.delete(n.id); // Mark as kept
                
                // O(1) reference check. Only deep dive if reference changed
                const lastSynced = lastSyncedNodesRef.current.get(n.id);
                if (lastSynced !== n) {
                    const existing = yNodes.get(n.id);
                    if (!existing || JSON.stringify(existing) !== JSON.stringify(n)) {
                        yNodes.set(n.id, n);
                    }
                }
            });
            // Delete removed nodes
            currentYNodeKeys.forEach(k => yNodes.delete(k));
            lastSyncedNodesRef.current = newNodesCache; // Update cache

            // 2. Process Edges
            const currentYEdgeKeys = new Set(yEdges.keys());
            const newEdgesCache = new Map<string, Edge>();
            
            edges.forEach(e => {
                newEdgesCache.set(e.id, e);
                currentYEdgeKeys.delete(e.id);
                
                // O(1) reference check.
                const lastSynced = lastSyncedEdgesRef.current.get(e.id);
                if (lastSynced !== e) {
                    const existing = yEdges.get(e.id);
                    if (!existing || JSON.stringify(existing) !== JSON.stringify(e)) {
                        yEdges.set(e.id, e);
                    }
                }
            });
            currentYEdgeKeys.forEach(k => yEdges.delete(k));
            lastSyncedEdgesRef.current = newEdgesCache; // Update cache
        });
    };

    return {
        isSynced: synced,
        provider,
        activeUsers,
        wsStatus,
        pushLocalChangesToYjs,
    };
}
