import { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { createGroupingPlan, deselectEdgesForGrouping } from './groupingOperations';

interface UseGroupingProps {
    nodes: Node[];
    edges: Edge[];
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
    setNodes,
    setEdges,
    selectedNodes,
    setSelectedNodes,
    takeSnapshot,
    defaultGroupLabel,
    defaultGroupDescription
}: UseGroupingProps) => {

    const handleGroup = useCallback(() => {
        const plan = createGroupingPlan({
            nodes,
            selectedNodes,
            groupId: `group-${Date.now()}`,
            defaultGroupLabel,
            defaultGroupDescription,
        });
        if (!plan) return;

        takeSnapshot(nodes, edges);
        setNodes(plan.nodes);
        setEdges(deselectEdgesForGrouping);
        setSelectedNodes([plan.groupNode]);
    }, [defaultGroupDescription, defaultGroupLabel, selectedNodes, nodes, edges, takeSnapshot, setNodes, setEdges, setSelectedNodes]);

    const handleUngroup = useCallback(() => {
        const groupsToUngroup = selectedNodes.filter(n => n.type === 'titleGroup' || n.type === 'subGroup');
        if (groupsToUngroup.length === 0) return;

        takeSnapshot(nodes, edges);

        setNodes(nds => {
            let nextNodes = [...nds];
            const groupIds = new Set(groupsToUngroup.map(g => g.id));

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
            return nextNodes.filter(n => !groupIds.has(n.id));
        });

        setEdges(deselectEdgesForGrouping);
        setSelectedNodes([]);
    }, [selectedNodes, nodes, edges, takeSnapshot, setNodes, setEdges, setSelectedNodes]);

    return {
        handleGroup,
        handleUngroup
    };
};
