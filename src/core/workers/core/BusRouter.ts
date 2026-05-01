/* eslint-disable @typescript-eslint/no-explicit-any */

import { analyzeGeometry } from '../../algorithms/geometry-classifier';
import { getNodePosition } from '../../algorithms/smartEdgeUtils';

/**
 * BusRouter: Specialized logic for handling "Bus" (merged) connections.
 * 
 * Responsibilities:
 * 1. Resolving the dominant orientation of a bus (Horizontal vs Vertical).
 * 2. Sorting edges within a bus to minimize crossings (Lane Assignment).
 * 3. Grouping edges by directional quadrants to ensure clean splits.
 */

// Basic interface for Nodes and Edges as used in the Worker
interface WorkerNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    [key: string]: any;
}

interface WorkerEdge {
    id: string;
    source: string;
    target: string;
    [key: string]: any;
}

/**
 * Determine the dominant orientation of a bus (spine).
 * Uses advanced geometry limits to prevent "Side Ports" on clearly vertical layouts.
 */
/**
 * @deprecated [T7] 请改用 BusDetector.resolveBusOrientation()
 * 此函数与 BusDetector 中的同名方法功能重叠，后者支持 nodeMap O(1) 查找和加权投票。
 * BusRouter.ts 中保留下来仅作实现参考，未来可能移除。
 */
export const resolveBusOrientation = (
    isTarget: boolean,
    commonNodeId: string,
    edges: WorkerEdge[],
    nodes: WorkerNode[],
    globalDir: string = 'LR'
): { busDir: string, isHorz: boolean } => {
    let horzVotes = 0;
    let vertVotes = 0;

    const relevantEdges = edges.filter(e => isTarget ? e.target === commonNodeId : e.source === commonNodeId);
    const selfNode = nodes.find(n => n.id === commonNodeId);
    if (!selfNode) return { busDir: globalDir, isHorz: globalDir === 'LR' || globalDir === 'RL' };

    relevantEdges.forEach(e => {
        const otherId = isTarget ? e.source : e.target;
        const otherNode = nodes.find(n => n.id === otherId);
        if (otherNode) {
            const dx = (otherNode.x + otherNode.width / 2) - (selfNode.x + selfNode.width / 2);
            const dy = (otherNode.y + otherNode.height / 2) - (selfNode.y + selfNode.height / 2);

            // [P4] Advanced Geometry Classification
            const geometry = analyzeGeometry(dx, dy, { enableDistanceAdaptive: true });

            // Map geometry-classifier output to simple votes
            if (geometry.startsWith('horizontal')) {
                horzVotes += 2; // Strong vote
            } else if (geometry.startsWith('vertical')) {
                vertVotes += 2; // Strong vote
            } else if (geometry === 'diagonal-ne' || geometry === 'diagonal-se' || geometry === 'diagonal-nw' || geometry === 'diagonal-sw') {
                // Diagonals: Vote based on Aspect Ratio of spacing
                if (Math.abs(dx) > Math.abs(dy) * 1.2) horzVotes += 1; // Weak vote
                else if (Math.abs(dy) > Math.abs(dx) * 1.2) vertVotes += 1;
            }
        }
    });

    // Decision (Tie-breaker: Global Direction)
    let finalDir = 'LR'; // Default
    if (horzVotes > vertVotes) finalDir = 'LR';
    else if (vertVotes > horzVotes) finalDir = 'TB';
    else {
        // Tie: Fallback to global
        finalDir = globalDir;
    }

    return { busDir: finalDir, isHorz: finalDir === 'LR' || finalDir === 'RL' };
};

/**
 * Determine the local direction quadrant of an edge relative to an origin node.
 * 0: Right, 1: Bottom, 2: Left, 3: Top
 */
/**
 * @deprecated [T7] 请改用 BusDetector.getEdgeQuadrant()
 * 此函数与 BusDetector 中的同名方法功能重叠。
 */
export const getEdgeQuadrant = (
    edgeId: string,
    originId: string,
    isSource: boolean,
    edges: WorkerEdge[],
    nodes: WorkerNode[]
): number => {
    const e = edges.find(ed => ed.id === edgeId);
    if (!e) return -1;
    const originNode = nodes.find(n => n.id === originId);
    const otherId = isSource ? e.target : e.source;
    const otherNode = nodes.find(n => n.id === otherId);

    if (!originNode || !otherNode) return -1;

    const originCenter = { x: originNode.x + originNode.width / 2, y: originNode.y + originNode.height / 2 };
    const otherCenter = { x: otherNode.x + otherNode.width / 2, y: otherNode.y + otherNode.height / 2 };
    const dx = otherCenter.x - originCenter.x;
    const dy = otherCenter.y - originCenter.y;

    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 2; // Right : Left
    return dy > 0 ? 1 : 3; // Bottom : Top
};

/**
 * Filter peers to only include those in compatible directional quadrants.
 * This prevents "Backward" lines from being grouped with "Forward" lines.
 */
/**
 * @deprecated [T7] 请改用 BusDetector.filterPeersByQuadrant()
 * 此函数与 BusDetector 中的同名方法功能重叠，后者已支持 nodeMap O(1) 查找。
 */
export const filterPeersByQuadrant = (
    peerList: WorkerEdge[],
    originId: string,
    isSource: boolean,
    targetQuad: number,
    edges: WorkerEdge[],
    nodes: WorkerNode[],
    layoutDirection: string = 'LR',
    refDx: number = 0,
    refDy: number = 0
): WorkerEdge[] => {
    if (targetQuad === -1) {
        // Safety: should not happen if called correctly, but fallback to return all
        return peerList;
    }

    // Determine if layout is primarily horizontal or vertical
    // This simplifies the "Hemisphere" check
    const isLayoutHorz = layoutDirection === 'LR' || layoutDirection === 'RL';

    return peerList.filter(e => {
        const originNode = nodes.find(n => n.id === originId);
        const otherId = isSource ? e.target : e.source;
        const otherNode = nodes.find(n => n.id === otherId);
        if (!originNode || !otherNode) return false;

        const oC = { x: originNode.x + originNode.width / 2, y: originNode.y + originNode.height / 2 };
        const tC = { x: otherNode.x + otherNode.width / 2, y: otherNode.y + otherNode.height / 2 };
        const dx = tC.x - oC.x;
        const dy = tC.y - oC.y;

        // "Hemisphere" Check:
        // Use reference edge direction (refDx/refDy) to determine the target hemisphere.
        // This ensures that "Steep" edges (e.g. Top-Left) are grouped with "Flat" edges (Left)
        // if they share the same general direction (Left).

        if (refDx !== 0 || refDy !== 0) {
             if (isLayoutHorz) {
                 // Horizontal Layout -> Care about Left vs Right
                 if (refDx > 0) return dx > 0; // Right Hemisphere
                 if (refDx < 0) return dx < 0; // Left Hemisphere
             } else {
                 // Vertical Layout -> Care about Top vs Bottom
                 if (refDy > 0) return dy > 0; // Bottom Hemisphere
                 if (refDy < 0) return dy < 0; // Top Hemisphere
             }
        }

        // Fallback to legacy Quadrant Check if refDx/refDy not provided
        if (isLayoutHorz) {
            // Horizontal Layout -> Care about Left vs Right
            if (targetQuad === 0 || targetQuad === 1 || targetQuad === 3) {
                // Right-ish
                if (targetQuad === 0) return dx > 0;
                return dx > 0; 
            } else if (targetQuad === 2) {
                // Left
                return dx < 0;
            }
        } else {
            // Vertical Layout -> Care about Top vs Bottom
            if (targetQuad === 1) return dy > 0; // Bottom
            if (targetQuad === 3) return dy < 0; // Top
        }

        // Default: Strict Quadrant Match
        const q = getEdgeQuadrant(e.id, originId, isSource, edges, nodes);
        return q === targetQuad;
    });
};

/**
 * Sort edges by V-Shape Lane Assignment (Inner to Outer).
 * This ensures that edges connecting to closer nodes get inner lanes,
 * preventing crossings.
 */
import type { EdgeConstraint } from '../../types/routing';

/**
 * Sort edges by V-Shape Lane Assignment (Inner to Outer).
 * This ensures that edges connecting to closer nodes get inner lanes,
 * preventing crossings.
 * 
 * [P2-3] Added support for Constraint-based Priority Sorting
 */
export const sortEdgesByLane = (
    edgeList: WorkerEdge[],
    isOutgoing: boolean,
    sourceId: string,
    targetId: string,
    nodes: WorkerNode[],
    busDir: string = 'LR',
    constraintsMap?: Record<string, EdgeConstraint>
): WorkerEdge[] => {

    const isHorzFlow = busDir === 'LR' || busDir === 'RL';

    // Helper to get sort metric (Distance from Source)
    const getSignedDist = (e: WorkerEdge) => {
        const otherId = isOutgoing ? e.target : e.source;
        const otherNode = nodes.find(n => n.id === otherId);
        // The "self" node is the pivot (Source for outgoing, Target for incoming)
        const selfNodeId = isOutgoing ? sourceId : targetId;
        const selfNode = nodes.find(n => n.id === selfNodeId);

        if (!otherNode || !selfNode) return 0;

        if (isHorzFlow) {
            // Vertical Spine (dy matters)
            const sY = getNodePosition(selfNode).y;
            const tY = getNodePosition(otherNode).y;
            return tY - sY;
        } else {
            // Horizontal Spine (dx matters)
            const sX = getNodePosition(selfNode).x;
            const tX = getNodePosition(otherNode).x;
            return tX - sX;
        }
    };

    // Helper: Get Priority (Lower = Inner/Earlier)
    const getPriority = (id: string) => {
        if (!constraintsMap || !constraintsMap[id]) return 0;
        return constraintsMap[id].priority || 0;
    };

    // Split into Upstream (Negative) and Downstream (Positive)
    const upstream: WorkerEdge[] = [];
    const downstream: WorkerEdge[] = [];
    const map = new Map<string, number>();

    edgeList.forEach(e => {
        const dist = getSignedDist(e);
        map.set(e.id, dist);
        if (dist < 0) upstream.push(e);
        else downstream.push(e);
    });

    // Sort Logic: Priority First, then Geometry
    const compare = (a: WorkerEdge, b: WorkerEdge) => {
        const pA = getPriority(a.id);
        const pB = getPriority(b.id);
        if (pA !== pB) return pA - pB; // Lower priority first

        // Geometric sort
        return (map.get(a.id) || 0) - (map.get(b.id) || 0);
    };

    upstream.sort(compare);
    downstream.sort(compare);

    return [...upstream, ...downstream];
};

/**
 * Dynamically adjust branch spacing based on node size and branch count.
 * This prevents overcrowding on large nodes and over-spacing on small nodes.
 */
export const calculateBusSeparation = (
    nodeRect: { x: number, y: number, width: number, height: number } | null,
    branchCount: number,
    isHorizontalSpine: boolean
): number => {
    const MIN_SEPARATION = 20;
    const MAX_SEPARATION = 80;
    const DEFAULT_SEPARATION = 40;

    if (!nodeRect || branchCount <= 1) {
        return DEFAULT_SEPARATION;
    }

    // Use node dimension perpendicular to spine direction
    const relevantDimension = isHorizontalSpine ? nodeRect.width : nodeRect.height;

    // Formula: separation = nodeSize / (branchCount + 2)
    const adaptiveSeparation = relevantDimension / (branchCount + 2);

    return Math.max(MIN_SEPARATION, Math.min(MAX_SEPARATION, adaptiveSeparation));
};
