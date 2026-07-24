import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';

import { appMessage } from '../../../utils/antdStaticBridge';

export function useMindMapSupplementalCommands(
    nodes: Node[],
    setNodes: Dispatch<SetStateAction<Node[]>>,
    setEdges: Dispatch<SetStateAction<Edge[]>>,
    takeSnapshot: () => void,
) {
    const handleAddSummary = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail || !detail.sourceIds) return;

        takeSnapshot();
        const newId = `summary-${Date.now()}`;
        const newNode: Node = {
            id: newId,
            type: 'mindmap',
            position: { x: 0, y: 0 },
            data: {
                label: '概要总结',
                isSummary: true,
                summaryTargetIds: detail.sourceIds,
                depth: 10,
            }
        };

        setNodes(nds => [...nds, newNode]);
    }, [setNodes, takeSnapshot]);

    const handleAddBoundary = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        const nodeId = detail?.sourceId || detail?.nodeId;
        const nodeIds = detail?.nodeIds || (nodeId ? [nodeId] : []);

        if (nodeIds.length === 0) return;

        takeSnapshot();
        const newId = `boundary-${Date.now()}`;
        const newNode: Node = {
            id: newId,
            type: 'mindmap-boundary',
            position: { x: 0, y: 0 }, // Will be calculated by orchestrator
            data: {
                targetSubtreeId: nodeIds[0],
                label: '逻辑外框',
                width: 100,
                height: 100,
            }
        };

        setNodes(nds => [...nds, newNode]);
    }, [setNodes, takeSnapshot]);

    const handleCreateRelationship = useCallback((e: Event) => {
        // Since we can't easily trigger connection programmatically across hooks without exposing internal RF state,
        // we use a message to guide the user. Professional tools often use this "mode" state.
        const detail = (e as CustomEvent).detail;
        if (detail?.sourceId) {
            // Highlighting the source node to guide the user
            setNodes(nds => nds.map(n => n.id === detail.sourceId ? { ...n, className: 'relationship-hint' } : n));
            setTimeout(() => {
                setNodes(nds => nds.map(n => n.id === detail.sourceId ? { ...n, className: '' } : n));
            }, 2000);

            appMessage.info('请拖动节点右侧红色手柄到目标节点');
        }
    }, [setNodes]);

    const handleSmartDelete = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        const targetIds = detail?.nodeIds || [];
        if (targetIds.length === 0) return;

        takeSnapshot();

        const nodeIdsToDelete = new Set<string>(targetIds);

        setEdges(currentEdges => {
            const nextEdges: Edge[] = [];
            const edgesToTransfer: { source: string, target: string, color?: string }[] = [];

            // 1. Identify edges to preserve and edges to "repair"
            currentEdges.forEach(edge => {
                const isSourceDeleted = nodeIdsToDelete.has(edge.source);
                const isTargetDeleted = nodeIdsToDelete.has(edge.target);

                if (isTargetDeleted) {
                    // Edge going to a deleted node -> ignore it, but check its children
                    return;
                }

                if (isSourceDeleted) {
                    // Edge coming from a deleted node -> this child is now orphaned
                    // Find the deleted node's parent to re-graft
                    const deletedNodeId = edge.source;
                    const parentEdge = currentEdges.find(ed => ed.target === deletedNodeId && ed.type !== 'relationshipEdge');

                    if (parentEdge) {
                        // Re-graft to grandparent
                        edgesToTransfer.push({
                            source: parentEdge.source,
                            target: edge.target,
                            color: edge.style?.stroke as string
                        });
                    }
                    return;
                }

                nextEdges.push(edge);
            });

            // 2. Add repaired edges
            edgesToTransfer.forEach(({ source, target, color }) => {
                const newId = `re-edge-${source}-${target}-${Date.now()}`;
                const targetNode = nodes.find(n => n.id === target);
                const depth = targetNode?.data?.depth as number ?? 1;

                nextEdges.push({
                    id: newId,
                    source,
                    target,
                    type: 'mindmapEdge',
                    style: {
                        strokeWidth: Math.max(1.5, 4 - (depth - 1) * 0.8),
                        stroke: color || '#6366f1'
                    },
                    data: { kind: 'mindmap' }
                });
            });

            // 3. Filter Nodes
            setNodes(currentNodes => {
                const nextNodes = currentNodes.filter(n => !nodeIdsToDelete.has(n.id));
                return nextNodes;
            });

            return nextEdges;
        });
    }, [nodes, setEdges, setNodes, takeSnapshot]);

    useEffect(() => {
        window.addEventListener('mindmap:smart-delete', handleSmartDelete);
        window.addEventListener('editor:add-summary-node', handleAddSummary);
        window.addEventListener('editor:add-boundary-node', handleAddBoundary);
        window.addEventListener('editor:create-relationship-edge', handleCreateRelationship);
        return () => {
            window.removeEventListener('mindmap:smart-delete', handleSmartDelete);
            window.removeEventListener('editor:add-summary-node', handleAddSummary);
            window.removeEventListener('editor:add-boundary-node', handleAddBoundary);
            window.removeEventListener('editor:create-relationship-edge', handleCreateRelationship);
        };
    }, [handleSmartDelete, handleAddSummary, handleAddBoundary, handleCreateRelationship]);
}
