import type { Node, XYPosition } from '@xyflow/react';

const HORIZONTAL_STEP = 200;
const VERTICAL_STEP = 120;
const MAX_PLACEMENT_ATTEMPTS = 8;

export interface FlowchartConnectedAddPlan {
    sourceNode: Node;
    position: XYPosition;
    sourceHandle: 'right';
    targetHandle: 'left';
}

const toFiniteCoordinate = (value: unknown): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const overlapsExistingNode = (position: XYPosition, nodes: Node[]): boolean => (
    nodes.some(node => (
        Math.abs(toFiniteCoordinate(node.position?.x) - position.x) < 150
        && Math.abs(toFiniteCoordinate(node.position?.y) - position.y) < 90
    ))
);

/**
 * Resolves the predictable click-to-add path used by the shape library.
 * Containers and ambiguous multi-selections intentionally fall back to free placement.
 */
export const resolveFlowchartConnectedAddPlan = (
    nodes: Node[],
    requestedType: string,
): FlowchartConnectedAddPlan | null => {
    if (requestedType !== 'flowchart') return null;

    const selectedFlowchartNodes = nodes.filter(
        node => node.selected === true && node.type === 'flowchart',
    );
    if (selectedFlowchartNodes.length !== 1) return null;

    const sourceNode = selectedFlowchartNodes[0];
    const sourceX = toFiniteCoordinate(sourceNode.position?.x);
    const sourceY = toFiniteCoordinate(sourceNode.position?.y);
    const position = {
        x: sourceX + HORIZONTAL_STEP,
        y: sourceY,
    };

    let attempts = 0;
    while (
        attempts < MAX_PLACEMENT_ATTEMPTS
        && overlapsExistingNode(position, nodes)
    ) {
        position.y += VERTICAL_STEP;
        attempts += 1;
    }

    return {
        sourceNode,
        position,
        sourceHandle: 'right',
        targetHandle: 'left',
    };
};
