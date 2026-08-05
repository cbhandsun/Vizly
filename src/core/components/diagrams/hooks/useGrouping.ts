import { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { createGroupingPlan, deselectEdgesForGrouping } from './groupingOperations';
import { hasMutationLockedNode, resolveTargetNodes } from '../nodeLockPolicy';

interface UseGroupingProps {
    nodes: Node[];
    edges: Edge[];
    nodesRef?: React.MutableRefObject<Node[]>;
    edgesRef?: React.MutableRefObject<Edge[]>;
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    selectedNodes: Node[];
    setSelectedNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    defaultGroupLabel?: string;
    defaultGroupDescription?: string;
}

export const useGrouping = ({
    nodes,
    edges,
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    selectedNodes,
    setSelectedNodes,
    takeSnapshot,
    defaultGroupLabel,
    defaultGroupDescription
}: UseGroupingProps) => {

    const handleGroup = useCallback(() => {
        const selectedIds = new Set(selectedNodes.map(node => node.id));
        const currentSelection = resolveTargetNodes(nodes, selectedIds);
        if (hasMutationLockedNode(currentSelection)) return;

        const plan = createGroupingPlan({
            nodes,
            selectedNodes: currentSelection,
            groupId: `group-${Date.now()}`,
            defaultGroupLabel,
            defaultGroupDescription,
        });
        if (!plan) return;

        takeSnapshot(nodes, edges);
        const nextEdges = deselectEdgesForGrouping(edges);
        if (nodesRef) nodesRef.current = plan.nodes;
        if (edgesRef) edgesRef.current = nextEdges;
        setNodes(plan.nodes);
        setEdges(nextEdges);
        setSelectedNodes([plan.groupNode]);
    }, [defaultGroupDescription, defaultGroupLabel, selectedNodes, nodes, edges, nodesRef, edgesRef, takeSnapshot, setNodes, setEdges, setSelectedNodes]);

    const handleUngroup = useCallback((targetNodeIds?: string[]) => {
        const selectedIds = new Set(targetNodeIds ?? selectedNodes.map(node => node.id));
        const groupsToUngroup = resolveTargetNodes(nodes, selectedIds)
            .filter(n => n.type === 'titleGroup' || n.type === 'subGroup');
        if (groupsToUngroup.length === 0) return;

        const groupIds = new Set(groupsToUngroup.map(group => group.id));
        const affectedNodes = nodes.filter(node => groupIds.has(node.id) || (node.parentId ? groupIds.has(node.parentId) : false));
        if (hasMutationLockedNode(affectedNodes)) return;

        takeSnapshot(nodes, edges);

        setNodes(nds => {
            let nextNodes = [...nds];
            // Process children
            nextNodes = nextNodes.map(n => {
                if (n.parentId && groupIds.has(n.parentId)) {
                    const parentGroup = groupsToUngroup.find(g => g.id === n.parentId);
                    if (parentGroup) {
                        const newParentId = parentGroup.parentId;
                        const newPosition = {
                            x: n.position.x + parentGroup.position.x,
                            y: n.position.y + parentGroup.position.y
                        };

                        const { parentId: _pid, extent: _ext, ...rest } = n;

                        if (newParentId) {
                            return {
                                ...rest,
                                parentId: newParentId,
                                extent: 'parent' as const,
                                position: newPosition
                            };
                        } else {
                            return {
                                ...rest,
                                position: newPosition
                            };
                        }
                    }
                }
                return n;
            });

            // Remove groups
            const ungroupedNodes = nextNodes.filter(n => !groupIds.has(n.id));
            if (nodesRef) nodesRef.current = ungroupedNodes;
            return ungroupedNodes;
        });

        setEdges(currentEdges => {
            const nextEdges = deselectEdgesForGrouping(currentEdges);
            if (edgesRef) edgesRef.current = nextEdges;
            return nextEdges;
        });
        setSelectedNodes([]);
    }, [selectedNodes, nodes, edges, nodesRef, edgesRef, takeSnapshot, setNodes, setEdges, setSelectedNodes]);

    return {
        handleGroup,
        handleUngroup
    };
};
