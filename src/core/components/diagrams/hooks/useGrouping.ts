import { useCallback, useEffect, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import { createGroupingPlan, createUngroupingPlan, deselectEdgesForGrouping } from './groupingOperations';
import { hasMutationLockedNode, resolveTargetNodes } from '../nodeLockPolicy';
import { scheduleFlowchartSelectedNodeFocus } from '../flowchartDeletionFocus';

interface UseGroupingProps {
    nodes: Node[];
    edges: Edge[];
    nodesRef?: React.MutableRefObject<Node[]>;
    edgesRef?: React.MutableRefObject<Edge[]>;
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    selectedNodes: Node[];
    setSelectedNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[], label?: string) => void;
    defaultGroupLabel?: string;
    defaultGroupDescription?: string;
    getGroupHistoryLabel?: (nodeCount: number) => string;
    getUngroupHistoryLabel?: (groupCount: number, nodeCount: number) => string;
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
    defaultGroupDescription,
    getGroupHistoryLabel,
    getUngroupHistoryLabel,
}: UseGroupingProps) => {
    const groupingFocusRequestRef = useRef<{ cancel: () => void } | null>(null);

    useEffect(() => () => {
        groupingFocusRequestRef.current?.cancel();
        groupingFocusRequestRef.current = null;
    }, []);

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

        takeSnapshot(nodes, edges, getGroupHistoryLabel?.(currentSelection.length));
        const nextEdges = deselectEdgesForGrouping(edges);
        if (nodesRef) nodesRef.current = plan.nodes;
        if (edgesRef) edgesRef.current = nextEdges;
        setNodes(plan.nodes);
        setEdges(nextEdges);
        setSelectedNodes([plan.groupNode]);
        groupingFocusRequestRef.current?.cancel();
        groupingFocusRequestRef.current = scheduleFlowchartSelectedNodeFocus(plan.groupNode.id);
    }, [defaultGroupDescription, defaultGroupLabel, selectedNodes, nodes, edges, nodesRef, edgesRef, takeSnapshot, setNodes, setEdges, setSelectedNodes, getGroupHistoryLabel]);

    const handleUngroup = useCallback((targetNodeIds?: string[]) => {
        const selectedIds = new Set(targetNodeIds ?? selectedNodes.map(node => node.id));
        const groupsToUngroup = resolveTargetNodes(nodes, selectedIds)
            .filter(n => n.type === 'titleGroup' || n.type === 'subGroup');
        if (groupsToUngroup.length === 0) return;

        const groupIds = new Set(groupsToUngroup.map(group => group.id));
        const affectedNodes = nodes.filter(node => groupIds.has(node.id) || (node.parentId ? groupIds.has(node.parentId) : false));
        if (hasMutationLockedNode(affectedNodes)) return;

        const ungroupedNodes = createUngroupingPlan({ nodes, groupIds });
        if (!ungroupedNodes) return;

        const selectedChildIds = new Set(
            affectedNodes
                .filter(node => !groupIds.has(node.id))
                .map(node => node.id),
        );
        const nextNodes = ungroupedNodes.map(node => ({
            ...node,
            selected: selectedChildIds.has(node.id),
        }));
        const nextSelection = nextNodes.filter(node => selectedChildIds.has(node.id));

        const affectedChildCount = affectedNodes.filter(node => !groupIds.has(node.id)).length;
        takeSnapshot(nodes, edges, getUngroupHistoryLabel?.(groupsToUngroup.length, affectedChildCount));
        if (nodesRef) nodesRef.current = nextNodes;
        setNodes(nextNodes);

        setEdges(currentEdges => {
            const nextEdges = deselectEdgesForGrouping(currentEdges);
            if (edgesRef) edgesRef.current = nextEdges;
            return nextEdges;
        });
        setSelectedNodes(nextSelection);
        groupingFocusRequestRef.current?.cancel();
        groupingFocusRequestRef.current = nextSelection[0]
            ? scheduleFlowchartSelectedNodeFocus(nextSelection[0].id)
            : null;
    }, [selectedNodes, nodes, edges, nodesRef, edgesRef, takeSnapshot, setNodes, setEdges, setSelectedNodes, getUngroupHistoryLabel]);

    return {
        handleGroup,
        handleUngroup
    };
};
