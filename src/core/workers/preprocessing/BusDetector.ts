/**
 * Bus Detector
 * 
 * Handles identification, orientation, and sorting of edges within bus structures.
 * Extracted from pathfinding.worker.ts for modularity.
 */

import { Rectangle } from '../../algorithms/geometryUtils';
import { UnifiedRoutingConfig, Position } from '../../types/routing';
import { SpatialIndex } from '../../algorithms/SpatialIndex';
import { getNodePosition } from '../../algorithms/smartEdgeUtils';
import type { NodeLike } from '../../algorithms/smartEdgeUtils';
import { countObstaclesInDirection } from '../core/GraphBuilder';

export interface BusGraphNode extends NodeLike {
    id: string;
    [key: string]: unknown;
}

export interface BusGraphEdge {
    id: string;
    source: string;
    target: string;
    type?: string;
    [key: string]: unknown;
}

export interface BusOrientation {
    busDir: string;
    isHorz: boolean;
}

export interface ConsensusResult {
    position: Position;
    hasFixed: boolean;
}

const finiteDimension = (primary: unknown, measured: unknown): number => {
    if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
    return typeof measured === 'number' && Number.isFinite(measured) ? measured : 0;
};

export class BusDetector {
    private config: UnifiedRoutingConfig;

    constructor(config: UnifiedRoutingConfig) {
        this.config = config;
    }

    /**
     * Resolve Bus Orientation via Cluster Analysis (Majority Vote)
     * Industry Standard: Analyze ALL edges in the Bus group to determine dominant flow.
     */
    resolveBusOrientation(
        isManyToOne: boolean,
        focusNodeId: string,
        allEdges: BusGraphEdge[],
        allNodes: BusGraphNode[],
        globalDir: string,
        nodeMap?: Map<string, BusGraphNode>  // [H-6] Optional O(1) lookup map to avoid O(N) find() per edge
    ): BusOrientation {
        if (!focusNodeId || !allEdges || !allNodes) {
            return { busDir: globalDir, isHorz: globalDir === 'LR' || globalDir === 'RL' };
        }

        // [H-6] Build nodeMap lazily if not provided (for backwards compatibility)
        const nMap = nodeMap ?? new Map(allNodes.map(n => [n.id, n]));

        let horzVotes = 0;
        let vertVotes = 0;
        const relevantEdges = isManyToOne
            ? allEdges.filter(e => e.target === focusNodeId)
            : allEdges.filter(e => e.source === focusNodeId);

        relevantEdges.forEach(e => {
            // [H-6] O(1) map lookup instead of O(N) find()
            const s = nMap.get(e.source);
            const t = nMap.get(e.target);
            if (s && t) {
                const sPos = getNodePosition(s);
                const tPos = getNodePosition(t);
                const sw = finiteDimension(s.width, s.measured?.width);
                const sh = finiteDimension(s.height, s.measured?.height);
                const tw = finiteDimension(t.width, t.measured?.width);
                const th = finiteDimension(t.height, t.measured?.height);
                const dx = Math.abs((tPos.x + tw / 2) - (sPos.x + sw / 2));
                const dy = Math.abs((tPos.y + th / 2) - (sPos.y + sh / 2));
                
                // [Bus Optimization] Weighted voting based on edge type
                // Main edges define the primary flow structure (Weight: 3)
                // Dependency/Association edges should follow the main flow (Weight: 1)
                const weight = (e.type === 'main' || !e.type) ? 3 : 1;

                // Weighted voting: stronger geometry = stronger vote
                if (dx > dy * 1.2) horzVotes += weight; // Significantly horizontal
                else if (dy > dx * 1.2) vertVotes += weight; // Significantly vertical
            }
        });

        const finalDir = horzVotes > vertVotes ? 'LR' : (vertVotes > horzVotes ? 'TB' : globalDir);

        return { busDir: finalDir, isHorz: finalDir === 'LR' || finalDir === 'RL' };
    }

    /**
     * Determine local direction of an edge relative to its origin
     */
    getEdgeQuadrant(
        eId: string,
        originId: string,
        isSource: boolean,
        nodes: BusGraphNode[],
        edges: BusGraphEdge[]
    ): number {
        const e = edges.find(ed => ed.id === eId);
        if (!e) return -1;
        const originNode = nodes.find(n => n.id === originId);
        const otherId = isSource ? e.target : e.source;
        const otherNode = nodes.find(n => n.id === otherId);

        if (!originNode || !otherNode) return -1;

        const originPos = getNodePosition(originNode);
        const otherPos = getNodePosition(otherNode);

        const originCenter = {
            x: originPos.x + finiteDimension(originNode.width, originNode.measured?.width) / 2,
            y: originPos.y + finiteDimension(originNode.height, originNode.measured?.height) / 2
        };
        const otherCenter = {
            x: otherPos.x + finiteDimension(otherNode.width, otherNode.measured?.width) / 2,
            y: otherPos.y + finiteDimension(otherNode.height, otherNode.measured?.height) / 2
        };
        const dx = otherCenter.x - originCenter.x;
        const dy = otherCenter.y - originCenter.y;

        if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 2; // Right : Left
        return dy > 0 ? 1 : 3; // Bottom : Top
    }

    /**
     * Filter peers by quadrant consistency
     */
    filterPeersByQuadrant(
        peerList: BusGraphEdge[],
        originId: string,
        isSource: boolean,
        targetQuad: number,
        nodes: BusGraphNode[],
        edges: BusGraphEdge[],
        layoutDirection: string,
        edgeId: string,
        nodeMap?: Map<string, BusGraphNode>  // [T4] O(1) 查找
    ): BusGraphEdge[] {
        if (targetQuad === -1) {
            const currentEdge = peerList.find(e => e.id === edgeId);
            return currentEdge ? [currentEdge] : [];
        }

        // [T4] 构建或复用 nodeMap
        const nMap = nodeMap ?? new Map(nodes.map(n => [n.id, n]));

        const originNode = nMap.get(originId);
        const refEdge = edges.find(e => e.id === edgeId);
        if (!originNode || !refEdge) {
            const currentEdge = peerList.find(e => e.id === edgeId);
            return currentEdge ? [currentEdge] : [];
        }

        const originPos = getNodePosition(originNode);
        const otherId = isSource ? refEdge.target : refEdge.source;
        const targetNode = nMap.get(otherId);

        let isHorz = true;
        if (targetNode) {
            const targetPos = getNodePosition(targetNode);
            const cDx = (
                targetPos.x + finiteDimension(targetNode.width, targetNode.measured?.width) / 2
            ) - (
                originPos.x + finiteDimension(originNode.width, originNode.measured?.width) / 2
            );
            const cDy = (
                targetPos.y + finiteDimension(targetNode.height, targetNode.measured?.height) / 2
            ) - (
                originPos.y + finiteDimension(originNode.height, originNode.measured?.height) / 2
            );
            isHorz = Math.abs(cDx) >= Math.abs(cDy);
        }

        return peerList.filter(e => {
            if (e.id === edgeId) return true;
            const peerOtherId = isSource ? e.target : e.source;
            const peerOtherNode = nMap.get(peerOtherId);  // [T4] O(1)
            if (!peerOtherNode) return false;

            const oC = {
                x: originPos.x + finiteDimension(originNode.width, originNode.measured?.width) / 2,
                y: originPos.y + finiteDimension(originNode.height, originNode.measured?.height) / 2
            };
            const pPos = getNodePosition(peerOtherNode);
            const tC = {
                x: pPos.x + finiteDimension(peerOtherNode.width, peerOtherNode.measured?.width) / 2,
                y: pPos.y + finiteDimension(peerOtherNode.height, peerOtherNode.measured?.height) / 2
            };
            const dx = tC.x - oC.x;
            const dy = tC.y - oC.y;

            if (isHorz) {
                if (targetQuad === 0 || targetQuad === 1 || targetQuad === 3) {
                    if (dx > 0) return true;
                } else if (targetQuad === 2) {
                    if (dx < 0) return true;
                }
            } else {
                if (targetQuad === 1 || targetQuad === 0 || targetQuad === 2) {
                    if (dy > 0) return true;
                } else if (targetQuad === 3) {
                    if (dy < 0) return true;
                }
            }
            return false;
        });
    }

    /**
     * Sort edges within a bus
     */
    sortEdges(
        edgeList: BusGraphEdge[],
        isOutgoing: boolean,
        nodes: BusGraphNode[],
        _edges: BusGraphEdge[],
        nodeMap?: Map<string, BusGraphNode>  // [T2] O(1) 查找
    ): BusGraphEdge[] {
        const nMap = nodeMap ?? new Map(nodes.map(n => [n.id, n]));
        const upstream: BusGraphEdge[] = [];
        const downstream: BusGraphEdge[] = [];
        const map = new Map<string, number>();

        edgeList.forEach(e => {
            const dist = this.getSignedDist(e, isOutgoing, nMap);
            map.set(e.id, dist);
            if (dist < 0) upstream.push(e);
            else downstream.push(e);
        });

        upstream.sort((a, b) => (map.get(a.id) || 0) - (map.get(b.id) || 0));
        downstream.sort((a, b) => (map.get(a.id) || 0) - (map.get(b.id) || 0));

        return [...upstream, ...downstream];
    }

    /**
     * Get signed distance for sorting (relative to hub node)
     */
    // [T2] 将参数改为 Map，O(1) 查找替换原来的 nodes.find() O(N)
    private getSignedDist(
        e: BusGraphEdge,
        isOutgoing: boolean,
        nodeMap: Map<string, BusGraphNode>
    ): number {
        const hubId = isOutgoing ? e.source : e.target;
        const otherId = isOutgoing ? e.target : e.source;
        const hub = nodeMap.get(hubId);
        const other = nodeMap.get(otherId);

        if (!hub || !other) return 0;

        const hubPosition = getNodePosition(hub);
        const otherPosition = getNodePosition(other);
        const hC = {
            x: hubPosition.x + finiteDimension(hub.width, hub.measured?.width) / 2,
            y: hubPosition.y + finiteDimension(hub.height, hub.measured?.height) / 2
        };
        const oC = {
            x: otherPosition.x + finiteDimension(other.width, other.measured?.width) / 2,
            y: otherPosition.y + finiteDimension(other.height, other.measured?.height) / 2
        };
        const dx = oC.x - hC.x;
        const dy = oC.y - hC.y;

        return Math.abs(dx) > Math.abs(dy) ? dy : dx;
    }

    /**
     * Calculate consensus port for a bus group
     */
    calculateBusConsensus(
        isManyToOne: boolean,
        nodeRect: Rectangle,
        peerEdges: BusGraphEdge[],
        nodes: BusGraphNode[],
        spatialIndex: SpatialIndex | null,
        obstacles: Rectangle[],
        existingPos: Position,
        hasExplicit: boolean
    ): ConsensusResult {
        if (hasExplicit) {
            return { position: existingPos, hasFixed: true };
        }

        if (peerEdges.length === 0) {
            return { position: existingPos, hasFixed: false };
        }

        const peerRects: Rectangle[] = [];
        let validPeers = 0;
        const centroid = peerEdges.reduce<{ x: number; y: number }>((acc, e) => {
            const otherId = isManyToOne ? e.source : e.target;
            const otherNode = nodes.find(n => n.id === otherId);
            if (!otherNode) return acc;

            validPeers++;
            const pos = getNodePosition(otherNode);
            const width = finiteDimension(otherNode.width, otherNode.measured?.width);
            const height = finiteDimension(otherNode.height, otherNode.measured?.height);
            peerRects.push({
                x: pos.x,
                y: pos.y,
                width,
                height
            });
            return {
                x: acc.x + pos.x + width / 2,
                y: acc.y + pos.y + height / 2
            };
        }, { x: 0, y: 0 });

        if (validPeers === 0) {
            return { position: existingPos, hasFixed: false };
        }

        centroid.x /= validPeers;
        centroid.y /= validPeers;

        const hubCenter = { x: nodeRect.x + nodeRect.width / 2, y: nodeRect.y + nodeRect.height / 2 };
        const dx = centroid.x - hubCenter.x;
        const dy = centroid.y - hubCenter.y;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        peerRects.forEach(r => {
            minX = Math.min(minX, r.x);
            minY = Math.min(minY, r.y);
            maxX = Math.max(maxX, r.x + r.width);
            maxY = Math.max(maxY, r.y + r.height);
        });

        let xOverlap = 0;
        let yOverlap = 0;
        if (minX !== Infinity) {
            const peersRect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            const overlaps = this.getProjectionOverlap(nodeRect, peersRect);
            xOverlap = overlaps.xOverlap;
            yOverlap = overlaps.yOverlap;
        }

        const slope = Math.abs(dx) / (Math.abs(dy) + 0.01);
        const nodeAspect = nodeRect.width / (nodeRect.height + 0.01);

        let useHorizontal: boolean;
        if (xOverlap > 20 && xOverlap >= yOverlap) {
            useHorizontal = false;
        } else if (yOverlap > 20 && yOverlap >= xOverlap) {
            useHorizontal = true;
        } else {
            const preferVertical = isManyToOne ? dy < -20 : dy > 20;
            const HORIZONTAL_BIAS = 1.5;
            if (preferVertical && Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) {
                useHorizontal = false;
            } else if (slope > 1.2) {
                useHorizontal = true;
            } else if (slope < 0.8) {
                useHorizontal = false;
            } else {
                if (nodeAspect > 1.2) useHorizontal = false;
                else if (nodeAspect < 0.8) useHorizontal = true;
                else useHorizontal = Math.abs(dx) > Math.abs(dy);
            }
        }

        let primaryPort: Position;
        let alternatePort: Position;

        if (useHorizontal) {
            primaryPort = dx > 0 ? Position.Right : Position.Left;
            alternatePort = dy > 0 ? Position.Bottom : Position.Top;
        } else {
            primaryPort = dy > 0 ? Position.Bottom : Position.Top;
            alternatePort = dx > 0 ? Position.Right : Position.Left;
        }

        const primaryObstacles = countObstaclesInDirection(nodeRect, primaryPort, spatialIndex || obstacles, 80);
        const alternateObstacles = countObstaclesInDirection(nodeRect, alternatePort, spatialIndex || obstacles, 80);

        const chosenPort = (primaryObstacles > 2 && alternateObstacles < primaryObstacles)
            ? alternatePort
            : primaryPort;

        return { position: chosenPort, hasFixed: true };
    }

    /**
     * Adaptive Bus Separation
     */
    // [T5] 分支间距考虑 peer 节点平均尺寸，而非仅依赖 hub 尺寸
    // 场景：hub 是大节点但 peers 小时，原公式过大；hub 小但 peers 大时，原公式过小
    calculateBusSeparation(
        nodeRect: Rectangle | null,
        branchCount: number,
        isHorizontalSpine: boolean,
        peerRects?: Rectangle[]  // [T5] peer 节点矩形列表，用于平均尺寸计算
    ): number {
        const MIN_SEPARATION = 20;
        const MAX_SEPARATION = 80;
        const DEFAULT_SEPARATION = this.config.bus.spacing || 40;

        if (!nodeRect || branchCount <= 1) {
            return DEFAULT_SEPARATION;
        }

        // hub 节点垂直于干线方向的尺寸
        const hubDim = isHorizontalSpine ? nodeRect.width : nodeRect.height;

        // [T5] 如果提供了 peerRects，取 hub 与 peers 平均尺寸的较小值
        let refDim = hubDim;
        if (peerRects && peerRects.length > 0) {
            const avgPeerDim = peerRects.reduce(
                (sum, p) => sum + (isHorizontalSpine ? p.height : p.width), 0
            ) / peerRects.length;
            // 参考尺寸 = hub 尺寸与「peer 平均尺寸 × branchCount」取较小值—防止过大
            refDim = Math.min(hubDim, avgPeerDim * branchCount);
        }

        const adaptiveSeparation = refDim / (branchCount + 2);
        return Math.max(MIN_SEPARATION, Math.min(MAX_SEPARATION, adaptiveSeparation));
    }

    private getProjectionOverlap(r1: Rectangle, r2: Rectangle) {
        const xOverlap = Math.max(0, Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x));
        const yOverlap = Math.max(0, Math.min(r1.y + r1.height, r2.y + r2.height) - Math.max(r1.y, r2.y));
        return { xOverlap, yOverlap };
    }
}
