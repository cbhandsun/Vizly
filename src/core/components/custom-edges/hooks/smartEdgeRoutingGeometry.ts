import type { RoutingNodeRect } from '../../../algorithms/containerHeaderSkimRepair';
import type { ObstacleNode } from '../obstacleContext';

export type PathPoint = { x: number; y: number };

export const snapSimpleOrthogonalPath = (path: string): string => {
    if (!path || /[ACQSTZ]/i.test(path)) return path;
    const matches = [...path.matchAll(/[ML]\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s+(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi)];
    if (matches.length < 2) return path;

    const commands = matches.map(match => ({
        cmd: match[0].trim()[0].toUpperCase(),
        x: Number(match[1]),
        y: Number(match[2]),
    }));
    if (!commands.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return path;

    const microAxisSnap = 1;
    for (let i = 0; i < commands.length - 1; i++) {
        const a = commands[i];
        const b = commands[i + 1];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dx <= microAxisSnap && dy > microAxisSnap) {
            b.x = a.x;
        } else if (dy <= microAxisSnap && dx > microAxisSnap) {
            b.y = a.y;
        }
    }

    return commands.map(point => `${point.cmd} ${point.x} ${point.y}`).join(' ');
};

const getNodeAbsPosition = (nodeLike: ObstacleNode, nodeMap: ReadonlyMap<string, ObstacleNode>, visited?: Set<string>): PathPoint => {
    const abs = nodeLike.internals?.positionAbsolute || nodeLike.computed?.positionAbsolute || nodeLike.positionAbsolute;
    if (abs) return { x: abs.x ?? 0, y: abs.y ?? 0 };
    const base = nodeLike.position || { x: nodeLike.x ?? 0, y: nodeLike.y ?? 0 };
    const parentId = nodeLike.parentId || nodeLike.parentNode;
    if (!parentId) return { x: base.x ?? 0, y: base.y ?? 0 };
    const v = visited || new Set<string>();
    const id = nodeLike.id;
    if (id && v.has(id)) return { x: base.x ?? 0, y: base.y ?? 0 };
    if (id) v.add(id);
    const parent = nodeMap.get(String(parentId));
    if (!parent) return { x: base.x ?? 0, y: base.y ?? 0 };
    const parentAbs = getNodeAbsPosition(parent, nodeMap, v);
    return { x: parentAbs.x + (base.x ?? 0), y: parentAbs.y + (base.y ?? 0) };
};

export const collectRoutingNodeRects = (nodeMap: ReadonlyMap<string, ObstacleNode>): RoutingNodeRect[] => {
    const rects: RoutingNodeRect[] = [];
    nodeMap.forEach((node) => {
        const pos = getNodeAbsPosition(node, nodeMap);
        const width = Number(node.width ?? node.measured?.width ?? node.style?.width ?? 0);
        const height = Number(node.height ?? node.measured?.height ?? node.style?.height ?? 0);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        rects.push({
            id: String(node.id),
            type: String(node.type ?? ''),
            x: pos.x,
            y: pos.y,
            width,
            height,
        });
    });
    return rects;
};
