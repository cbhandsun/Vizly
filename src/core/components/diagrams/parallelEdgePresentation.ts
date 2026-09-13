import type { Edge } from '@xyflow/react';

const PARALLEL_LABEL_GAP = 18;
const MAX_PARALLEL_EDGE_GROUP = 64;

type EdgeData = Record<string, unknown>;

const asData = (value: unknown): EdgeData => (
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as EdgeData : {}
);

const finiteOffset = (value: unknown): { x: number; y: number } | null => {
    const point = asData(value);
    return typeof point.x === 'number' && Number.isFinite(point.x)
        && typeof point.y === 'number' && Number.isFinite(point.y)
        ? { x: point.x, y: point.y }
        : null;
};

const terminalToken = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase() : '');

const isVerticalTerminalEdge = (edge: Edge): boolean => (
    /(^t$|top|^b$|bottom)/.test(terminalToken(edge.sourceHandle))
    || /(^t$|top|^b$|bottom)/.test(terminalToken(edge.targetHandle))
);

const laneOffset = (edge: Edge, index: number, count: number) => {
    const delta = Math.round((index - (count - 1) / 2) * PARALLEL_LABEL_GAP);
    return isVerticalTerminalEdge(edge) ? { x: delta, y: 0 } : { x: 0, y: delta };
};

const clearParallelData = (edge: Edge): Edge => {
    const data = asData(edge.data);
    if (
        data.parallelLaneIndex === undefined
        && data.parallelLaneCount === undefined
        && data.autoParallelLabelOffset !== true
    ) return edge;
    const nextData = { ...data };
    const removeAutoOffset = nextData.autoParallelLabelOffset === true;
    delete nextData.parallelLaneIndex;
    delete nextData.parallelLaneCount;
    delete nextData.autoParallelLabelOffset;
    if (removeAutoOffset) delete nextData.labelOffset;
    return { ...edge, data: nextData };
};

const applyLaneData = (edge: Edge, index: number, count: number): Edge => {
    const data = asData(edge.data);
    const manualOffset = data.autoParallelLabelOffset === true ? null : finiteOffset(data.labelOffset);
    return {
        ...edge,
        data: {
            ...data,
            parallelLaneIndex: index,
            parallelLaneCount: count,
            ...(manualOffset
                ? { labelOffset: manualOffset }
                : { labelOffset: laneOffset(edge, index, count), autoParallelLabelOffset: true }),
        },
    };
};

/**
 * Assign deterministic presentation metadata to directed parallel edges.
 * This intentionally staggers labels first, not route geometry: route-level
 * lane separation still belongs in the display-routing worker where hard
 * geometry gates can validate terminals, crossings, and obstacle clearance.
 */
export const applyParallelEdgePresentation = (edges: readonly Edge[]): Edge[] => {
    const groups = new Map<string, Edge[]>();
    for (const edge of edges) {
        const key = `${edge.source}\u0000${edge.target}`;
        const group = groups.get(key);
        if (group) group.push(edge);
        else groups.set(key, [edge]);
    }

    const byId = new Map<string, Edge>();
    for (const group of groups.values()) {
        if (group.length <= 1 || group.length > MAX_PARALLEL_EDGE_GROUP) {
            group.forEach(edge => byId.set(edge.id, clearParallelData(edge)));
            continue;
        }
        [...group].sort((a, b) => a.id.localeCompare(b.id)).forEach((edge, index) => {
            byId.set(edge.id, applyLaneData(edge, index, group.length));
        });
    }
    return edges.map(edge => byId.get(edge.id) ?? edge);
};
