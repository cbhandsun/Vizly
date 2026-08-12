import type { Node } from '@xyflow/react';

export interface FloatingToolbarStyleState {
    opacity: number;
    opacityMixed: boolean;
    strokeWidth: number;
    dashed: boolean;
    borderMixed: boolean;
}

const toFiniteNumber = (value: unknown, fallback: number): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const readOpacity = (node: Node): number => {
    const value = toFiniteNumber(node.style?.opacity, 1);
    return Math.min(1, Math.max(0, value));
};

const readStrokeWidth = (node: Node): number => {
    const value = toFiniteNumber(node.style?.strokeWidth, 1);
    return Math.max(0, value);
};

const readDashed = (node: Node): boolean => node.style?.strokeDasharray === '4,4';

export const resolveFloatingToolbarStyleState = (
    selectedNodes: readonly Node[],
): FloatingToolbarStyleState => {
    const first = selectedNodes[0];
    if (!first) {
        return {
            opacity: 1,
            opacityMixed: false,
            strokeWidth: 1,
            dashed: false,
            borderMixed: false,
        };
    }

    const opacity = readOpacity(first);
    const strokeWidth = readStrokeWidth(first);
    const dashed = readDashed(first);

    return {
        opacity,
        opacityMixed: selectedNodes.some(node => readOpacity(node) !== opacity),
        strokeWidth,
        dashed,
        borderMixed: selectedNodes.some(node => (
            readStrokeWidth(node) !== strokeWidth || readDashed(node) !== dashed
        )),
    };
};
