import { useEffect, useState, useMemo } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Node, Edge, useReactFlow } from '@xyflow/react';

export interface YjsCollaborationOptions {
    roomName: string;
    serverUrl: string; // Made required, as we rely purely on WebSocket now
    token?: string;    // JWT Token for authentication
    enabled?: boolean;
}

/**
 * 概念验证:
 *   利用 Yjs 的 Y.Map 和 Y.Array 实现 ReactFlow Nodes & Edges 的协同互转。
 *   在真实业务中，这个需要考虑双向绑定和冲突解决 (Awareness/Cursor)。
 */
export function useYjsCollaboration(options: YjsCollaborationOptions) {
    const { roomName, serverUrl, token, enabled = true } = options;
    const reactFlowInstance = useReactFlow();
    
    const [synced, setSynced] = useState(false);
    
    // 初始化 Yjs Doc 及其 Provider
    const { doc, provider, yNodes, yEdges } = useMemo(() => {
        if (!enabled || !serverUrl) return { doc: null, provider: null, yNodes: null, yEdges: null };
        
        const ydoc = new Y.Doc();
        
        // 构建带有 Token 的 WebSocket 鉴权 URL (可根据实际后端网关协议调整)
        const wsParams = token ? { params: { token } } : {};
        
        // 纯 WebSocket 连接 (无中心 WebRTC 已在此 Phase 剥离，确保本地数据不泄漏)
        const yProvider = new WebsocketProvider(serverUrl, roomName, ydoc, {
            connect: true,
            ...wsParams
        });
            
        // 数据结构定义：用 Y.Map 存储所有 nodes，Key是 NodeJS，Value 是 Node 对象
        const nodesMap = ydoc.getMap<Node>('flowchart-nodes');
        
        // 也可以用 Y.Array，但 Y.Map 对于基于 Key 寻址/更新的 Diagram 系统更有利
        const edgesMap = ydoc.getMap<Edge>('flowchart-edges');

        return { doc: ydoc, provider: yProvider, yNodes: nodesMap, yEdges: edgesMap };
    }, [roomName, serverUrl, token, enabled]);

    // 绑定 Doc 同步事件
    useEffect(() => {
        if (!provider || !yNodes || !yEdges) return;

        const handleSync = (isSynced: boolean) => setSynced(isSynced);
        
        (provider as any).on('synced', handleSync);

        // 如果服务端数据发生变化，同步到 ReactFlow
        const handleRemoteChange = (event: Y.YMapEvent<any>) => {
            if (event.transaction.local) return; // 忽略本地触发的回调，防止死循环反弹

            // 目前是将所有值拿出来 overwrite react flow，
            // TODO: 在生产环境应当比较增量变化（Reactflow 也有 onNodesChange 触发器）
            const nodesArr = Array.from(yNodes.values());
            const edgesArr = Array.from(yEdges.values());
            
            reactFlowInstance.setNodes(nodesArr);
            reactFlowInstance.setEdges(edgesArr);
        };

        yNodes.observe(handleRemoteChange);
        yEdges.observe(handleRemoteChange);

        return () => {
            (provider as any).off('synced', handleSync);
            yNodes.unobserve(handleRemoteChange);
            yEdges.unobserve(handleRemoteChange);
            if (provider) provider.destroy();
            if (doc) doc.destroy();
        };
    }, [provider, yNodes, yEdges, reactFlowInstance, doc]);

    // 对外提供一层代理提交更新到 Yjs，进而触发其他人端的 YEvent 同步
    const pushLocalChangesToYjs = (nodes: Node[], edges: Edge[]) => {
        if (!doc || !yNodes || !yEdges || !enabled) return;
        
        // 将 React Flow 中的每次变化写入 Y.Map
        doc.transact(() => {
            // 增量对象 diff 避免无效的全量网路广播
            const currentKeys = new Set(yNodes.keys());
            nodes.forEach(n => {
                const existing = yNodes.get(n.id);
                if (!existing || JSON.stringify(existing) !== JSON.stringify(n)) {
                    yNodes.set(n.id, n);
                }
                currentKeys.delete(n.id);
            });
            // 剩下的就是删掉的
            currentKeys.forEach(k => yNodes.delete(k));

            const edgeKeys = new Set(yEdges.keys());
            edges.forEach(e => {
                const existing = yEdges.get(e.id);
                if (!existing || JSON.stringify(existing) !== JSON.stringify(e)) {
                    yEdges.set(e.id, e);
                }
                edgeKeys.delete(e.id);
            });
            edgeKeys.forEach(k => yEdges.delete(k));
        });
    };

    return {
        isSynced: synced,
        provider,
        pushLocalChangesToYjs,
    };
}
