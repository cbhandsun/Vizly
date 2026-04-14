import { useCallback, useEffect, useRef } from 'react';
import { Node, Edge, MarkerType, EdgeMarkerType } from '@xyflow/react';
import { NodeDataUpdate, EdgeDataUpdate } from '../../../types/diagram-updates';

interface UseDesignerBatchUpdatesOptions {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    setSelectedNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setSelectedEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
}

/**
 * 节点/边批量更新逻辑（含选中态同步、Snapshot 管理）
 * 从 FlowchartDesigner 提取，供 PropertyPanel / FloatingToolbar 使用
 */
export function useDesignerBatchUpdates({
    nodes,
    edges,
    setNodes,
    setEdges,
    setSelectedNodes,
    setSelectedEdges,
    takeSnapshot,
}: UseDesignerBatchUpdatesOptions) {
    // ⭐ 修复闪烁问题：使用 useRef 模式稳定 updateNodesBatch
    // 避免因 nodes/edges 变化导致 nodeTypes 重新创建，进而导致所有节点重新挂载
    const nodesRefForUpdate = useRef(nodes);
    const edgesRefForUpdate = useRef(edges);
    useEffect(() => {
        nodesRefForUpdate.current = nodes;
        edgesRefForUpdate.current = edges;
    }, [nodes, edges]);

    // Callbacks for Property Panel
    const updateNodesBatchCore = useCallback((ids: string[], partialData: NodeDataUpdate) => {
        const idSet = new Set(ids);
        setNodes(nds => {
            const nextNodes = nds.map(n => {
                if (idSet.has(n.id)) {
                    // Support updating style and data separately
                    const updated = { ...n };

                    // 1. Handle Style
                    if ('style' in partialData && partialData.style) {
                        updated.style = { ...(updated.style || {}), ...partialData.style };
                    }

                    // 2. Handle Data (explicit)
                    if ('data' in partialData && partialData.data) {
                        updated.data = { ...updated.data, ...partialData.data };
                    }

                    // 3. Handle Theme (explicit nested)
                    if ('theme' in partialData && partialData.theme) {
                        updated.data = { ...(updated.data as Record<string, unknown>), theme: { ...((updated.data as any)?.theme || {}), ...partialData.theme } };
                    }

                    // 4. Handle Legacy/Implicit Data properties
                    const { style: _style, data: _data, theme: _theme, position: _position, ...rest } = partialData as any;
                    
                    if (_position !== undefined) {
                        updated.position = _position;
                    }

                    if (Object.keys(rest).length > 0) {
                        updated.data = { ...updated.data, ...rest };
                    }

                    return updated;
                }
                return n;
            });

            // Synchronize selection state to avoid controlled component revert
            const updatedSelected = nextNodes.filter(n => idSet.has(n.id));
            if (updatedSelected.length > 0) {
                setSelectedNodes(current => current.map(sn => {
                    const findMatched = updatedSelected.find(un => un.id === sn.id);
                    return findMatched || sn;
                }));
            }

            return nextNodes;
        });
    }, [setNodes, setSelectedNodes]);

    const updateNodesBatch = useCallback((ids: string[], partialData: NodeDataUpdate, options?: { snapshot?: boolean }) => {
        if (options?.snapshot !== false) {
            takeSnapshot(nodesRefForUpdate.current, edgesRefForUpdate.current); // ✅ 使用 ref
        }
        updateNodesBatchCore(ids, partialData);
    }, [takeSnapshot, updateNodesBatchCore]); // ✅ 移除 nodes 和 edges 依赖

    const updateEdgesBatch = useCallback((ids: string[], partialData: EdgeDataUpdate) => {
        const idSet = new Set(ids);
        setEdges(eds => {
            const nextEdges = eds.map(e => {
                if (idSet.has(e.id)) {
                    const updated = { ...e };

                    if (partialData.style) {
                        updated.style = { ...updated.style, ...partialData.style };
                    }

                    if (partialData.markerEnd) {
                        const currentMarker = updated.markerEnd;

                        if (typeof partialData.markerEnd === 'string') {
                            // Directly override with a simple marker id / type
                            updated.markerEnd = partialData.markerEnd as EdgeMarkerType;
                        } else {
                            const baseMarker: Record<string, unknown> =
                                typeof currentMarker === 'string'
                                    ? { type: currentMarker }
                                    : (currentMarker as Record<string, unknown>) || { type: MarkerType.ArrowClosed };

                            const patch = partialData.markerEnd as Record<string, unknown>;

                            updated.markerEnd = { ...baseMarker, ...patch } as EdgeMarkerType;
                        }
                    }

                    if (partialData.data) {
                        updated.data = { ...(updated.data || {}), ...partialData.data };
                    }

                    const { style: _style, data: _data, markerEnd: _markerEnd, ...rest } = partialData;
                    return { ...updated, ...rest };
                }
                return e;
            });

            // Synchronize selection state
            const updatedSelected = nextEdges.filter(e => idSet.has(e.id));
            if (updatedSelected.length > 0) {
                setSelectedEdges(current => current.map(se => {
                    const findMatched = updatedSelected.find(ue => ue.id === se.id);
                    return findMatched || se;
                }));
            }

            return nextEdges; // Fix: Return the updated edges array
        });
    }, [setEdges, setSelectedEdges]);

    return { updateNodesBatch, updateEdgesBatch };
}
