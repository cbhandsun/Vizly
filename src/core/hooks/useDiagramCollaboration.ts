import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { Node, Edge, applyNodeChanges, applyEdgeChanges, XYPosition } from '@xyflow/react';
import { useDiagramStore, CommentThread } from '../store/useDiagramStore';
import { collaborationService } from '../services/CollaborationService';

/**
 * 协同同步钩子 (Phase 9)
 * 将 Zustand 状态与 Yjs 共享类型进行双向绑定
 */
export function useDiagramCollaboration(diagramId: string, enabled: boolean = true) {
    const setNodes = useDiagramStore(state => state.setNodes);
    const setEdges = useDiagramStore(state => state.setEdges);
    
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

        // 3. 监听远程变化 (Yjs -> State)
        const observeHandler = () => {
            isRemoteUpdateRef.current = true;
            
            doc.transact(() => {
                const remoteNodes = Array.from(yNodes.values());
                const remoteEdges = Array.from(yEdges.values());
                const remoteComments = Array.from(yComments.values());
                
                // 深度同步
                setNodes(remoteNodes);
                setEdges(remoteEdges);

                // ⭐ Phase 11: 同步评论
                useDiagramStore.getState().setComments(remoteComments);
            }, 'remote');

            setTimeout(() => {
                isRemoteUpdateRef.current = false;
            }, 0);
        };

        yNodes.observe(observeHandler);
        yEdges.observe(observeHandler);
        yComments.observe(observeHandler);

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
            yNodes.unobserve(observeHandler);
            yEdges.unobserve(observeHandler);
            yComments.unobserve(observeHandler);
            collaborationService.destroy();
        };
    }, [diagramId, enabled]);

    const comments = useDiagramStore(state => state.comments);

    // 7. 监听本地评论变化并广播 (State -> Yjs)
    useEffect(() => {
        if (!enabled || isRemoteUpdateRef.current) return;

        const doc = collaborationService.getDoc();
        const yComments = doc.getMap<CommentThread>('comments');

        doc.transact(() => {
            comments.forEach(c => {
                const current = yComments.get(c.id);
                if (JSON.stringify(current) !== JSON.stringify(c)) {
                    yComments.set(c.id, c);
                }
            });

            // 检查删除
            const commentIds = new Set(comments.map(c => c.id));
            yComments.forEach((_, id) => {
                if (!commentIds.has(id)) yComments.delete(id);
            });
        }, 'local-comments');
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
