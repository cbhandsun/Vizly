/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { countObstaclesInDirection } from '../core/GraphBuilder';

export interface BusOrientation {
    busDir: string;
    isHorz: boolean;
}

export interface ConsensusResult {
    position: Position;
    hasFixed: boolean;
}

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
        allEdges: any[],
        allNodes: any[],
        globalDir: string,
        nodeMap?: Map<string, any>  // [H-6] Optional O(1) lookup map to avoid O(N) find() per edge
    ): BusOrientation {
        if (!focusNodeId || !allEdges || !allNodes) {
            return { busDir: globalDir, isHorz: globalDir === 'LR' || globalDir === 'RL' };
        }

        // [H-6] Build nodeMap lazily if not provided (for backwards compatibility)
        const nMap = nodeMap ?? new Map<string, any>(allNodes.map((n: any) => [n.id, n]));

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
                const sw = (s.width || s.measured?.width || 0) as number;
                const sh = (s.height || s.measured?.height || 0) as number;
                const tw = (t.width || t.measured?.width || 0) as number;
                const th = (t.height || t.measured?.height || 0) as number;
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

        let finalDir = 'LR'; // Default
        if (horzVotes > vertVotes) finalDir = 'LR';
        else if (vertVotes > horzVotes) finalDir = 'TB';
        else {
            finalDir = globalDir;
        }

        return { busDir: finalDir, isHorz: finalDir === 'LR' || finalDir === 'RL' };
    }

    /**
     * Determine local direction of an edge relative to its origin
     */
    getEdgeQuadrant(
        eId: string,
        originId: string,
        isSource: boolean,
        nodes: any[],
        edges: any[]
    ): number {
        const e = edges.find((ed: any) => ed.id === eId);
        if (!e) return -1;
        const originNode = nodes.find((n: any) => n.id === originId);
        const otherId = isSource ? e.target : e.source;
        const otherNode = nodes.find((n: any) => n.id === otherId);

        if (!originNode || !otherNode) return -1;

        const originPos = getNodePosition(originNode);
        const otherPos = getNodePosition(otherNode);

        const originCenter = {
            x: originPos.x + (originNode.width || originNode.measured?.width || 0) / 2,
            y: originPos.y + (originNode.height || originNode.measured?.height || 0) / 2
        };
        const otherCenter = {
            x: otherPos.x + (otherNode.width || otherNode.measured?.width || 0) / 2,
            y: otherPos.y + (otherNode.height || otherNode.measured?.height || 0) / 2
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
        peerList: any[],
        originId: string,
        isSource: boolean,
        targetQuad: number,
        nodes: any[],
        edges: any[],
        layoutDirection: string,
        edgeId: string
    ): any[] {
        if (targetQuad === -1) {
            const currentEdge = peerList.find(e => e.id === edgeId);
            return currentEdge ? [currentEdge] : [];
        }

        const originNode = nodes.find((n: any) => n.id === originId);
        const refEdge = edges.find((e: any) => e.id === edgeId);
        if (!originNode || !refEdge) return [peerList.find(e => e.id === edgeId)].filter(Boolean);

        // [FIX] Use getNodePosition
        const originPos = getNodePosition(originNode);

        // Determine orientation
        const otherId = isSource ? refEdge.target : refEdge.source;
        const targetNode = nodes.find((n: any) => n.id === otherId);
        
        let isHorz = true;
        if (targetNode) {
            const targetPos = getNodePosition(targetNode);
            const cDx = (targetPos.x + (targetNode.width || 0) / 2) - (originPos.x + (originNode.width || 0) / 2);
            const cDy = (targetPos.y + (targetNode.height || 0) / 2) - (originPos.y + (originNode.height || 0) / 2);
            isHorz = Math.abs(cDx) >= Math.abs(cDy);
        }

        return peerList.filter((e: any) => {
            if (e.id === edgeId) return true;

            const peerOtherId = isSource ? e.target : e.source;
            const peerOtherNode = nodes.find((n: any) => n.id === peerOtherId);
            if (!peerOtherNode) return false;

            const oC = { 
                x: originPos.x + (originNode.width || originNode.measured?.width || 0) / 2, 
                y: originPos.y + (originNode.height || originNode.measured?.height || 0) / 2 
            };
            
            const pPos = getNodePosition(peerOtherNode);
            const tC = { 
                x: pPos.x + (peerOtherNode.width || peerOtherNode.measured?.width || 0) / 2, 
                y: pPos.y + (peerOtherNode.height || peerOtherNode.measured?.height || 0) / 2 
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
        edgeList: any[],
        isOutgoing: boolean,
        nodes: any[],
        _edges: any[]
    ): any[] {
        const upstream: any[] = [];
        const downstream: any[] = [];
        const map = new Map<string, number>();

        edgeList.forEach(e => {
            const dist = this.getSignedDist(e, isOutgoing, nodes);
            map.set(e.id, dist);
            if (dist < 0) upstream.push(e);
            else downstream.push(e);
        });

        // Standard Ascending Sort works for both
        upstream.sort((a, b) => (map.get(a.id) || 0) - (map.get(b.id) || 0));
        downstream.sort((a, b) => (map.get(a.id) || 0) - (map.get(b.id) || 0));

        return [...upstream, ...downstream];
    }

    /**
     * Get signed distance for sorting (relative to hub node)
     */
    private getSignedDist(
        e: any,
        isOutgoing: boolean,
        nodes: any[]
    ): number {
        const hubId = isOutgoing ? e.source : e.target;
        const otherId = isOutgoing ? e.target : e.source;
        const hub = nodes.find(n => n.id === hubId);
        const other = nodes.find(n => n.id === otherId);

        if (!hub || !other) return 0;

        const hC = { x: hub.x + (hub.width || 0) / 2, y: hub.y + (hub.height || 0) / 2 };
        const oC = { x: other.x + (other.width || 0) / 2, y: other.y + (other.height || 0) / 2 };
        const dx = oC.x - hC.x;
        const dy = oC.y - hC.y;

        // If predominantly horizontal, use dy as sort metric (and vice versa)
        // This spreads edges along the spine
        return Math.abs(dx) > Math.abs(dy) ? dy : dx;
    }

    /**
     * Calculate consensus port for a bus group
     */
    calculateBusConsensus(
        isManyToOne: boolean,
        nodeRect: Rectangle,
        peerEdges: any[],
        nodes: any[],
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
        const centroid = peerEdges.reduce((acc: any, e: any) => {
            const otherId = isManyToOne ? e.source : e.target;
            const otherNode = nodes.find(n => n.id === otherId);
            if (!otherNode) return acc;

            validPeers++;
            const pos = getNodePosition(otherNode);
            const width = otherNode.width || (otherNode.measured?.width) || 0;
            const height = otherNode.height || (otherNode.measured?.height) || 0;
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
    calculateBusSeparation(
        nodeRect: Rectangle | null,
        branchCount: number,
        isHorizontalSpine: boolean
    ): number {
        const MIN_SEPARATION = 20;
        const MAX_SEPARATION = 80;
        const DEFAULT_SEPARATION = this.config.bus.spacing || 40;

        if (!nodeRect || branchCount <= 1) {
            return DEFAULT_SEPARATION;
        }

        const relevantDimension = isHorizontalSpine ? nodeRect.width : nodeRect.height;
        const adaptiveSeparation = relevantDimension / (branchCount + 2);

        return Math.max(MIN_SEPARATION, Math.min(MAX_SEPARATION, adaptiveSeparation));
    }

    private getProjectionOverlap(r1: Rectangle, r2: Rectangle) {
        const xOverlap = Math.max(0, Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x));
        const yOverlap = Math.max(0, Math.min(r1.y + r1.height, r2.y + r2.height) - Math.max(r1.y, r2.y));
        return { xOverlap, yOverlap };
    }
}
