import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { FlowchartNodeData } from './FlowchartNode';
import type { FlowchartQuickCloneDirection } from './flowchartQuickClone';

interface FlowchartMutationResult {
    nodes: Node[];
    edges: Edge[];
    newNode: Node;
}

export interface FlowchartQuickCloneMutationResult extends FlowchartMutationResult {
    nodeSize: {
        width: number;
        height: number;
    };
}

const readNodeDimension = (
    node: Node,
    dimension: 'width' | 'height',
    fallback: number,
): number => {
    const measured = node.measured?.[dimension];
    const declared = node[dimension];
    return typeof measured === 'number' && Number.isFinite(measured) && measured > 0
        ? measured
        : typeof declared === 'number' && Number.isFinite(declared) && declared > 0
            ? declared
            : fallback;
};

const createUniqueId = (
    prefix: string,
    existingIds: ReadonlySet<string>,
    timestamp: number,
): string => {
    const baseId = `${prefix}-${timestamp}`;
    if (!existingIds.has(baseId)) return baseId;

    let suffix = 2;
    while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1;
    return `${baseId}-${suffix}`;
};

export const shouldSnapshotFlowchartNodeDataUpdate = (
    update: Partial<FlowchartNodeData>,
): boolean => Object.keys(update).some(key => key !== 'isEditing');

export const cloneFlowchartNode = ({
    nodes,
    edges,
    sourceId,
    timestamp,
}: {
    nodes: Node[];
    edges: Edge[];
    sourceId: string;
    timestamp: number;
}): FlowchartMutationResult | null => {
    const source = nodes.find(node => node.id === sourceId);
    if (!source) return null;

    const newNode: Node = {
        ...source,
        id: createUniqueId(
            `${source.id}_copy`,
            new Set(nodes.map(node => node.id)),
            timestamp,
        ),
        position: {
            x: source.position.x + 30,
            y: source.position.y + 30,
        },
        data: { ...source.data },
        style: source.style ? { ...source.style } : undefined,
        selected: true,
    };

    return {
        nodes: [
            ...nodes.map(node => ({ ...node, selected: false })),
            newNode,
        ],
        edges: edges.map(edge => ({ ...edge, selected: false })),
        newNode,
    };
};

export const quickCloneFlowchartNode = ({
    nodes,
    edges,
    sourceId,
    direction,
    label,
    timestamp,
}: {
    nodes: Node[];
    edges: Edge[];
    sourceId: string;
    direction: FlowchartQuickCloneDirection;
    label: string;
    timestamp: number;
}): FlowchartQuickCloneMutationResult | null => {
    const sourceNode = nodes.find(node => node.id === sourceId);
    if (!sourceNode) return null;

    const offsetX = 180;
    const offsetY = 140;
    let x = sourceNode.position.x;
    let y = sourceNode.position.y;

    const moveCandidate = () => {
        switch (direction) {
            case 'top':
                y -= offsetY;
                break;
            case 'bottom':
                y += offsetY;
                break;
            case 'left':
                x -= offsetX;
                break;
            case 'right':
                x += offsetX;
                break;
        }
    };
    moveCandidate();

    const width = readNodeDimension(sourceNode, 'width', 120);
    const height = readNodeDimension(sourceNode, 'height', 60);
    const overlapPadding = 20;
    const maximumShifts = 5;

    for (let shift = 0; shift < maximumShifts; shift += 1) {
        const overlapsExistingNode = nodes.some(node => {
            if (node.id === sourceId) return false;
            const nodeWidth = readNodeDimension(node, 'width', 120);
            const nodeHeight = readNodeDimension(node, 'height', 60);
            return !(
                x + width + overlapPadding < node.position.x
                || x > node.position.x + nodeWidth + overlapPadding
                || y + height + overlapPadding < node.position.y
                || y > node.position.y + nodeHeight + overlapPadding
            );
        });
        if (!overlapsExistingNode) break;
        moveCandidate();
    }

    const existingNodeIds = new Set(nodes.map(node => node.id));
    const newNodeId = createUniqueId('flowchart-node', existingNodeIds, timestamp);
    const sourceData = sourceNode.data as FlowchartNodeData;
    const shape = sourceData.shape || 'rectangle';
    const newNode: Node = {
        id: newNodeId,
        type: sourceNode.type,
        position: { x, y },
        style: sourceNode.style ? { ...sourceNode.style } : undefined,
        data: {
            label,
            shape,
            ...(sourceData.theme && { theme: { ...sourceData.theme } }),
            ...(sourceData.domainClass && { domainClass: sourceData.domainClass }),
            ...(sourceData.domain && { domain: sourceData.domain }),
            ...(sourceData.style && { style: { ...sourceData.style } }),
            ...(sourceData.textAlign && { textAlign: sourceData.textAlign }),
            isEditing: true,
            layer: sourceData.layer || 'layer-0',
        },
        selected: true,
    };

    let sourceHandle = 'right';
    let targetHandle = 'left';
    switch (direction) {
        case 'top':
            sourceHandle = 'top';
            targetHandle = 'bottom';
            break;
        case 'bottom':
            sourceHandle = 'bottom';
            targetHandle = 'top';
            break;
        case 'left':
            sourceHandle = 'left';
            targetHandle = 'right';
            break;
        case 'right':
            break;
    }

    const newEdge: Edge = {
        id: `e-${sourceId}-${newNodeId}`,
        source: sourceId,
        target: newNodeId,
        sourceHandle,
        targetHandle,
        type: 'advanced-smart-step',
        markerEnd: { type: MarkerType.ArrowClosed },
        selected: false,
    };

    return {
        nodes: [
            ...nodes.map(node => ({ ...node, selected: false })),
            newNode,
        ],
        edges: [
            ...edges.map(edge => ({ ...edge, selected: false })),
            newEdge,
        ],
        newNode,
        nodeSize: { width, height },
    };
};
