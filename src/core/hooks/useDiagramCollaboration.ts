import { useEffect, useRef, useCallback } from 'react';
import { Node, Edge, XYPosition } from '@xyflow/react';
import { useDiagramStore, CommentThread } from '../store/useDiagramStore';
import { collaborationService } from '../services/CollaborationService';

interface CollaborationSliceActions {
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    setComments: (comments: CommentThread[]) => void;
}

interface CollaborationMap<T> {
    get: (id: string) => T | undefined;
    set: (id: string, value: T) => unknown;
    delete: (id: string) => unknown;
    forEach: (callback: (value: T, id: string) => void) => void;
}

export const createDiagramCollaborationSliceSync = ({
    setNodes,
    setEdges,
    setComments,
}: CollaborationSliceActions) => ({
    nodes: (nodes: Iterable<Node>) => setNodes(Array.from(nodes)),
    edges: (edges: Iterable<Edge>) => setEdges(Array.from(edges)),
    comments: (comments: Iterable<CommentThread>) => setComments(Array.from(comments)),
});

export const syncDiagramCollaborationMap = <T extends { id: string }>(
    target: CollaborationMap<T>,
    values: T[],
): void => {
    const nextIds = new Set(values.map(value => value.id));
    values.forEach((value) => {
        const current = target.get(value.id);
        // React Flow preserves object identity for unchanged nodes and edges.
        // Avoid serializing the entire graph on every single-node drag frame.
        if (current !== value && JSON.stringify(current) !== JSON.stringify(value)) {
            target.set(value.id, value);
        }
    });
    target.forEach((_value, id) => {
        if (!nextIds.has(id)) target.delete(id);
    });
};

/**
 * 协同同步钩子 (Phase 9)
 * 将 Zustand 状态与 Yjs 共享类型进行双向绑定
 */
export function useDiagramCollaboration(diagramId: string, enabled: boolean = true) {
    const setNodes = useDiagramStore(state => state.setNodes);
    const setEdges = useDiagramStore(state => state.setEdges);
    const nodes = useDiagramStore(state => state.nodes);
    const edges = useDiagramStore(state => state.edges);
    
    // 标记当前更新是否来自协同同步，防止死循环
    const isRemoteUpdateRef = useRef(false);

    useEffect(() => {
        if (!enabled || !diagramId) return;

        // 1. 初始化服务
        collaborationService.init(diagramId);
        const doc = collaborationService.getDoc();

        // 2. 获取共享类型
        const yNodes = doc.getMap<Node>('nodes');
        const yEdges = doc.getMap<Edge>('edges');
        const yComments = doc.getMap<CommentThread>('comments');

        const sliceSync = createDiagramCollaborationSliceSync({
            setNodes,
            setEdges,
            setComments: useDiagramStore.getState().setComments,
        });
        const syncRemoteSlice = (sync: () => void) => {
            isRemoteUpdateRef.current = true;
            sync();
            setTimeout(() => {
                isRemoteUpdateRef.current = false;
            }, 0);
        };
        // Each Yjs type owns one local state slice. A comment-only transaction
        // must never replace nodes or edges with an unseeded remote map.
        const observeNodes = (_event: unknown, transaction: { origin: unknown }) => {
            if (transaction.origin === 'local-graph') return;
            syncRemoteSlice(() => sliceSync.nodes(yNodes.values()));
        };
        const observeEdges = (_event: unknown, transaction: { origin: unknown }) => {
            if (transaction.origin === 'local-graph') return;
            syncRemoteSlice(() => sliceSync.edges(yEdges.values()));
        };
        const observeComments = (_event: unknown, transaction: { origin: unknown }) => {
            if (transaction.origin === 'local-comments') return;
            syncRemoteSlice(() => sliceSync.comments(yComments.values()));
        };

        yNodes.observe(observeNodes);
        yEdges.observe(observeEdges);
        yComments.observe(observeComments);

        // 4. 初始化本地数据到云端 (如果云端为空)
        const currentNodes = useDiagramStore.getState().nodes;
        const currentEdges = useDiagramStore.getState().edges;
        if (yNodes.size === 0 && currentNodes.length > 0) {
            doc.transact(() => {
                currentNodes.forEach(n => yNodes.set(n.id, n));
                currentEdges.forEach(e => yEdges.set(e.id, e));
                // 同步初始评论
                const currentComments = useDiagramStore.getState().comments;
                currentComments.forEach(c => yComments.set(c.id, c));
            }, 'initial');
        }

        return () => {
            yNodes.unobserve(observeNodes);
            yEdges.unobserve(observeEdges);
            yComments.unobserve(observeComments);
            collaborationService.destroy();
        };
    }, [diagramId, enabled, setEdges, setNodes]);

    // Broadcast graph edits as well as comments. Without this path the Yjs map
    // retains the preset snapshot and a later provider update can roll back a
    // local layout, grouping, or drag operation.
    useEffect(() => {
        if (!enabled || !diagramId || isRemoteUpdateRef.current) return;

        const doc = collaborationService.getDoc();
        const yNodes = doc.getMap<Node>('nodes');
        const yEdges = doc.getMap<Edge>('edges');
        doc.transact(() => {
            syncDiagramCollaborationMap(yNodes, nodes);
            syncDiagramCollaborationMap(yEdges, edges);
        }, 'local-graph');
    }, [diagramId, edges, enabled, nodes]);

    const comments = useDiagramStore(state => state.comments);

    // 7. 监听本地评论变化并广播 (State -> Yjs)
    useEffect(() => {
        if (!enabled || isRemoteUpdateRef.current) return;

        const doc = collaborationService.getDoc();
        const yComments = doc.getMap<CommentThread>('comments');

        doc.transact(() => syncDiagramCollaborationMap(yComments, comments), 'local-comments');
    }, [comments, enabled]);

    // 6. 光标同步
    const updateLocalCursor = useCallback((pos: XYPosition | null) => {
        if (!enabled) return;
        const awareness = collaborationService.getAwarenessSafe();
        if (!awareness) return; // offline/local-only mode — silently skip
        awareness.setLocalStateField('cursor', pos);
    }, [enabled]);

    return {
        updateLocalCursor,
        localUser: collaborationService.getLocalUser()
    };
}
