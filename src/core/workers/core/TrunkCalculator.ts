/**
 * Trunk Calculator
 * 
 * Calculates trunk/merge points for bus routing (1-to-N and N-to-1 connections).
 * Implements industry-standard bus routing logic similar to ELK/Dagre.
 */

import { Point, Rectangle } from '../../algorithms/geometryUtils';
import { UnifiedRoutingConfig } from '../../types/routing';

export interface TrunkResult {
    trunkPoint: Point;
    trunkDirection: 'horizontal' | 'vertical';
    suggestedPort: 'top' | 'bottom' | 'left' | 'right';
}

export class TrunkCalculator {
    /**
     * Calculate trunk point for bus routing
     * 
     * @param hubNode Central node (source for 1-to-N, target for N-to-1)
     * @param peerNodes Peer nodes (targets for 1-to-N, sources for N-to-1)
     * @param isManyToOne Whether this is N-to-1 (true) or 1-to-N (false)
     * @param config Routing configuration
     * @returns Trunk point coordinates and direction
     */
    calculateTrunkPoint(
        hubNode: Rectangle,
        peerNodes: Rectangle[],
        isManyToOne: boolean,
        config: UnifiedRoutingConfig
    ): TrunkResult {
        // 1. Calculate centroid of peer nodes
        const centroid = this.calculateCentroid(peerNodes);

        // 2. Determine trunk direction
        const hubCenter = {
            x: hubNode.x + hubNode.width / 2,
            y: hubNode.y + hubNode.height / 2
        };

        const dx = Math.abs(centroid.x - hubCenter.x);
        const dy = Math.abs(centroid.y - hubCenter.y);
        const isHorizontal = dx > dy;

        // 3. Calculate trunk length based on peer count
        const trunkBase = config.bus.trunkBase;
        const trunkMultiplier = config.bus.trunkMultiplier;
        const trunkLength = trunkBase + peerNodes.length * trunkMultiplier;

        // 4. Calculate trunk point position
        let trunkPoint: Point;
        let suggestedPort: 'top' | 'bottom' | 'left' | 'right';

        if (isManyToOne) {
            // Many-to-One: trunk point near target (hub)
            if (isHorizontal) {
                // Horizontal trunk
                const isFromLeft = centroid.x < hubCenter.x;
                trunkPoint = {
                    x: isFromLeft
                        ? hubNode.x - trunkLength
                        : hubNode.x + hubNode.width + trunkLength,
                    y: hubCenter.y
                };
                suggestedPort = isFromLeft ? 'left' : 'right';
            } else {
                // Vertical trunk
                const isFromTop = centroid.y < hubCenter.y;
                trunkPoint = {
                    x: hubCenter.x,
                    y: isFromTop
                        ? hubNode.y - trunkLength
                        : hubNode.y + hubNode.height + trunkLength
                };
                suggestedPort = isFromTop ? 'top' : 'bottom';
            }
        } else {
            // One-to-Many: trunk point near source (hub)
            if (isHorizontal) {
                const isToRight = centroid.x > hubCenter.x;
                trunkPoint = {
                    x: isToRight
                        ? hubNode.x + hubNode.width + trunkLength
                        : hubNode.x - trunkLength,
                    y: hubCenter.y
                };
                suggestedPort = isToRight ? 'right' : 'left';
            } else {
                const isToBottom = centroid.y > hubCenter.y;
                trunkPoint = {
                    x: hubCenter.x,
                    y: isToBottom
                        ? hubNode.y + hubNode.height + trunkLength
                        : hubNode.y - trunkLength
                };
                suggestedPort = isToBottom ? 'bottom' : 'top';
            }
        }

        return {
            trunkPoint,
            trunkDirection: isHorizontal ? 'horizontal' : 'vertical',
            suggestedPort
        };
    }

    /**
     * Calculate Orthogonal Tree Trunk Axis
     * Industry Standard: A fixed line perpendicular to flow, near the hub.
     * Used for "Manhattan Tree" routing.
     */
    calculateTreeTrunk(
        hubNode: Rectangle,
        peerNodes: Rectangle[],
        isManyToOne: boolean,
        config: UnifiedRoutingConfig,
        layoutDirection: string = 'LR',
        precomputedCentroid?: Point,    // [T3] 可选预计算质心
        obstacles?: Rectangle[]         // [T1] 可选障碍物列表，用于轴线扫描避障
    ): { axis: number; direction: 'horizontal' | 'vertical'; range: { min: number; max: number }; suggestedPort: 'top' | 'bottom' | 'left' | 'right' } {
        const hubCenter = {
            x: hubNode.x + hubNode.width / 2,
            y: hubNode.y + hubNode.height / 2
        };

        // [FIX] Filter obstacles: exclude the hub and peer nodes themselves.
        // The trunk axis sits between hub and peers — those nodes should NOT trigger collision.
        // Only third-party sibling nodes (the ones the trunk might cross through) matter.
        const isRectsEqual = (a: Rectangle, b: Rectangle) =>
            Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2 &&
            Math.abs(a.width - b.width) < 2 && Math.abs(a.height - b.height) < 2;

        const filteredObstacles = obstacles?.filter(o => {
            if (isRectsEqual(o, hubNode)) return false;
            for (const peer of peerNodes) {
                if (isRectsEqual(o, peer)) return false;
            }
            return true;
        });

        // [S4-P12] Guard: empty peerNodes would produce NaN/Infinity in all calculations.
        // Return a safe fallback trunk directly below/to-the-right of the hub.
        if (peerNodes.length === 0) {
            const isHorzFallback = layoutDirection === 'LR' || layoutDirection === 'RL';
            const spacing = Math.max(config.bus.trunkBase || 40, 30);
            if (isHorzFallback) {
                return {
                    axis: hubNode.x + hubNode.width + spacing,
                    direction: 'vertical',
                    range: { min: hubCenter.y, max: hubCenter.y },
                    suggestedPort: 'right'
                };
            } else {
                return {
                    axis: hubNode.y + hubNode.height + spacing,
                    direction: 'horizontal',
                    range: { min: hubCenter.x, max: hubCenter.x },
                    suggestedPort: 'bottom'
                };
            }
        }

        // Default to layoutDirection, refine by geometry if needed
        let isHorizontal = layoutDirection === 'LR' || layoutDirection === 'RL';

        // [FIX] Geometry Override for Process Flows
        // If geometry is overwhelmingly Top-Down (Vertical Flow), we MUST use a Horizontal Trunk (isHorz=false)
        // regardless of the default 'LR' setting.
        // [T3] 使用预传质心（若有），避免重复遍历 peerNodes
        const peersCenter = precomputedCentroid ?? this.calculateCentroid(peerNodes);
        const dx = Math.abs(peersCenter.x - hubCenter.x);
        const dy = Math.abs(peersCenter.y - hubCenter.y);

        // If Vertical separation is dominant (Process Flow)
        if (dy > dx * 1.5 && dy > 40) {
            isHorizontal = false; // Force Vertical Flow Mode (Horizontal Trunk)
        }
        // If Horizontal separation is dominant (Timeline/Swimlane Flow)
        else if (dx > dy * 1.5 && dx > 40) {
            isHorizontal = true; // Force Horizontal Flow Mode (Vertical Trunk)
        }

        // Helper: Get Bounds
        const getBounds = (nodes: Rectangle[]) => {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            nodes.forEach(n => {
                minX = Math.min(minX, n.x);
                maxX = Math.max(maxX, n.x + n.width);
                minY = Math.min(minY, n.y);
                maxY = Math.max(maxY, n.y + n.height);
            });
            if (minX === Infinity) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
            return { minX, maxX, minY, maxY };
        };
        const pBounds = getBounds(peerNodes);

        // 2. Calculate Axis Position
        // Spacing: trunkBase with Minimum Limit to prevent node overlap
        // [Imp-12] Force at least 30px spacing always
        const spacing = Math.max(config.bus.trunkBase || 40, 30);
        let axis = 0;
        const range = { min: Infinity, max: -Infinity };
        let suggestedPort: 'top' | 'bottom' | 'left' | 'right';

        if (isHorizontal) {
            // Vertical Trunk Line (x = constant)
            // Determine side based on centroid relative to hub
            let isLeft = false;

            if (isManyToOne) {
                // N -> 1. Peers -> Hub.
                // If peers are left, trunk is left.
                isLeft = peersCenter.x < hubCenter.x;
            } else {
                // 1 -> N. Hub -> Peers.
                // If peers are left, trunk is left.
                isLeft = peersCenter.x < hubCenter.x;
            }

            const grid = 20;
            const standardOffset = spacing + 20; // Default elbow distance

            if (isLeft) {
                // Trunk on Left: Between PeersMaxX and HubMinX
                const minSafe = hubNode.x - spacing;
                // [FIX-elbow-consistency] Instead of pure midpoint, use a snapped offset from hub
                // as the preferred axis, clamped by pBounds.maxX.
                const preferred = Math.floor((hubNode.x - standardOffset) / grid) * grid;
                // Ensure it doesn't cross the peers if they are very close
                const peerSafe = pBounds.maxX + 10;
                axis = Math.max(peerSafe, Math.min(preferred, minSafe));
                suggestedPort = 'left';
            } else {
                // Trunk on Right: Between HubMaxX and PeersMinX
                const minSafe = hubNode.x + hubNode.width + spacing;
                // [FIX-elbow-consistency] Use a snapped offset from the hub to align different buses
                const preferred = Math.ceil((hubNode.x + hubNode.width + standardOffset) / grid) * grid;
                // Ensure it doesn't cross the peers if they are very close
                const peerSafe = pBounds.minX - 10;
                axis = Math.min(peerSafe, Math.max(preferred, minSafe));
                suggestedPort = 'right';
            }

            // Calculate Range (Y min/max)
            peerNodes.forEach(p => {
                const cY = p.y + p.height / 2;
                range.min = Math.min(range.min, cY);
                range.max = Math.max(range.max, cY);
            });
            range.min = Math.min(range.min, hubCenter.y);
            range.max = Math.max(range.max, hubCenter.y);
            if (!isFinite(range.min) || !isFinite(range.max)) {
                range.min = hubCenter.y;
                range.max = hubCenter.y;
            }

            // [T1] 垂直干线（x=axis）障碍物扫描：确保主干通道（axis +/- 10px）不穿透任何节点
            if (filteredObstacles && filteredObstacles.length > 0) {
                // [FIX-robust-collision] 多轮扫描以应对重叠障碍物
                let collisionFound = true;
                let safetyAttempt = 0;
                const corridorHalf = 10;

                while (collisionFound && safetyAttempt < 3) {
                    collisionFound = false;
                    // 使用 10px 的通道宽度进行检测，防止贴边导致的视觉穿透
                    const blockers = filteredObstacles.filter(o =>
                        o.x < axis + corridorHalf && o.x + o.width > axis - corridorHalf &&
                        o.y < range.max + spacing && o.y + o.height > range.min - spacing
                    );

                    if (blockers.length > 0) {
                        collisionFound = true;

                        if (isLeft) {
                            // 主干在左侧：推向更左侧。推开后重新吸附到网格（向下取整，确保远离 Hub 和障碍物）
                            const minX = Math.min(...blockers.map(o => o.x));
                            const clearAxis = minX - spacing;
                            axis = Math.floor(clearAxis / grid) * grid;
                        } else {
                            // 主干在右侧：推向更右侧。向上取整吸附网格
                            const maxX = Math.max(...blockers.map(o => o.x + o.width));
                            const clearAxis = maxX + spacing;
                            axis = Math.ceil(clearAxis / grid) * grid;
                        }
                    }
                    safetyAttempt++;
                }
            }

            // [T1-Final-Guard] 最终边界兜底，确保主干至少在 Hub 边缘之外
            if (isLeft) {
                axis = Math.min(axis, hubNode.x - spacing);
            } else {
                axis = Math.max(axis, hubNode.x + hubNode.width + spacing);
            }


            return { axis, direction: 'vertical', range, suggestedPort };

        } else {
            // Horizontal Trunk Line (y = constant)
            // Determine which side the trunk should be on:
            //   M2O (hub=target): peers are sources → if peers are ABOVE hub → trunk above hub → isTop=true
            //   O2M (hub=source): peers are targets → if peers are BELOW hub → trunk below hub → isTop=false
            // In both cases: isTop = (peersCenter.y < hubCenter.y), because:
            //   - peers above hub (peersCenter.y < hubCenter.y) → trunk sits above hub → isTop
            //   - peers below hub (peersCenter.y > hubCenter.y) → trunk sits below hub → !isTop
            const isTop: boolean = peersCenter.y < hubCenter.y;

            const grid = 20;
            const standardOffset = spacing + 20;

            if (isTop) {
                // Trunk on Top: midpoint between peers' bottom and hub's top
                const minSafe = hubNode.y - spacing;
                // [FIX-elbow-consistency] Use snapped offset
                const preferred = Math.floor((hubNode.y - standardOffset) / grid) * grid;
                const peerSafe = pBounds.maxY + 10;
                axis = Math.max(peerSafe, Math.min(preferred, minSafe));
                suggestedPort = 'top';
            } else {
                // Trunk on Bottom: midpoint between hub's bottom and peers' top
                const minSafe = hubNode.y + hubNode.height + spacing;
                // [FIX-elbow-consistency] Use snapped offset
                const preferred = Math.ceil((hubNode.y + hubNode.height + standardOffset) / grid) * grid;
                const peerSafe = pBounds.minY - 10;
                axis = Math.min(peerSafe, Math.max(preferred, minSafe));
                suggestedPort = 'bottom';
            }

            // Calculate Range (X min/max)
            peerNodes.forEach(p => {
                const cX = p.x + p.width / 2;
                range.min = Math.min(range.min, cX);
                range.max = Math.max(range.max, cX);
            });
            range.min = Math.min(range.min, hubCenter.x);
            range.max = Math.max(range.max, hubCenter.x);
            if (!isFinite(range.min) || !isFinite(range.max)) {
                range.min = hubCenter.x;
                range.max = hubCenter.x;
            }

            // [T1] 水平干线（y=axis）障碍物扫描
            if (filteredObstacles && filteredObstacles.length > 0) {
                let collisionFound = true;
                let safetyAttempt = 0;
                const corridorHalf = 10;
                while (collisionFound && safetyAttempt < 3) {
                    collisionFound = false;
                    const blockers = filteredObstacles.filter(o =>
                        o.y < axis + corridorHalf && o.y + o.height > axis - corridorHalf &&
                        o.x < range.max + spacing && o.x + o.width > range.min - spacing
                    );
                    if (blockers.length > 0) {
                        collisionFound = true;
                        if (isTop) {
                            const minY = Math.min(...blockers.map(o => o.y));
                            const clearAxis = minY - spacing;
                            axis = Math.floor(clearAxis / grid) * grid;
                        } else {
                            const maxY = Math.max(...blockers.map(o => o.y + o.height));
                            const clearAxis = maxY + spacing;
                            axis = Math.ceil(clearAxis / grid) * grid;
                        }
                    }
                    safetyAttempt++;
                }
            }

            // [T1-Final-Guard]
            if (isTop) {
                axis = Math.min(axis, hubNode.y - spacing);
            } else {
                axis = Math.max(axis, hubNode.y + hubNode.height + spacing);
            }

            if (config.debug && !suggestedPort!) {
                console.error('[TrunkCalculator] suggestedPort was never assigned for horizontal trunk!', { isManyToOne, isTop });
            }

            return { axis, direction: 'horizontal', range, suggestedPort };

        }
    }

    /**
     * Calculate centroid (center of mass) of multiple nodes
     */
    private calculateCentroid(nodes: Rectangle[]): Point {
        if (nodes.length === 0) {
            return { x: 0, y: 0 };
        }

        const sum = nodes.reduce((acc, node) => ({
            x: acc.x + node.x + node.width / 2,
            y: acc.y + node.y + node.height / 2
        }), { x: 0, y: 0 });

        return {
            x: sum.x / nodes.length,
            y: sum.y / nodes.length
        };
    }

    /**
     * Check if trunk routing should be applied
     * 
     * @param peerCount Number of peer nodes
     * @param minThreshold Minimum peers to form a bus (default: 3)
     * @returns Whether trunk routing should be used
     */
    shouldUseTrunkRouting(peerCount: number, minThreshold: number = 2): boolean {
        return peerCount >= minThreshold;
    }

    /**
     * [Phase 3] Calculate Parallel Trunks for Forward and Backward Edges
     * 
     * Supports dual-trunk architecture where forward and backward edges
     * get separate trunk lines with configurable spacing.
     * 
     * @param hubNode - The hub node rectangle
     * @param forwardPeers - Peer nodes for forward edges
     * @param backwardPeers - Peer nodes for backward edges
     * @param isManyToOne - Direction flag
     * @param config - Routing configuration
     * @param layoutDirection - Layout direction (LR, RL, TB, BT)
     * @returns Object containing forward and backward trunk results
     */
    calculateParallelTrunks(
        hubNode: Rectangle,
        forwardPeers: Rectangle[],
        backwardPeers: Rectangle[],
        isManyToOne: boolean,
        config: UnifiedRoutingConfig,
        layoutDirection: string = 'LR',
        obstacles?: Rectangle[]       // [FIX] Obstacle list for trunk axis collision avoidance
    ): {
        forward?: { axis: number; direction: 'horizontal' | 'vertical'; range: { min: number; max: number }; suggestedPort: 'top' | 'bottom' | 'left' | 'right' };
        backward?: { axis: number; direction: 'horizontal' | 'vertical'; range: { min: number; max: number }; suggestedPort: 'top' | 'bottom' | 'left' | 'right' };
    } {
        const TRUNK_SEPARATION = config.bus?.parallelTrunkSpacing || 60;
        const STRATEGY = config.bus?.parallelTrunkStrategy || 'count-based';

        const results: {
            forward?: { axis: number; direction: 'horizontal' | 'vertical'; range: { min: number; max: number }; suggestedPort: 'top' | 'bottom' | 'left' | 'right' };
            backward?: { axis: number; direction: 'horizontal' | 'vertical'; range: { min: number; max: number }; suggestedPort: 'top' | 'bottom' | 'left' | 'right' };
        } = {};

        // 1. Calculate independent trunks first to check for side/port availability
        // This ensures that if groups are naturally on opposite sides (Left vs Right), they get independent trunks without forced offsets.
        // [T3] 预计算各组质心，供 calculateTreeTrunk 和碰撞检查复用
        const forwardCentroid = forwardPeers.length > 0 ? this.calculateCentroid(forwardPeers) : undefined;
        const backwardCentroid = backwardPeers.length > 0 ? this.calculateCentroid(backwardPeers) : undefined;

        const forwardTrunkRaw = forwardPeers.length > 0
            ? this.calculateTreeTrunk(hubNode, forwardPeers, isManyToOne, config, layoutDirection, forwardCentroid, obstacles)
            : undefined;

        const backwardTrunkRaw = backwardPeers.length > 0
            ? this.calculateTreeTrunk(hubNode, backwardPeers, isManyToOne, config, layoutDirection, backwardCentroid, obstacles)
            : undefined;

        // 2. Check for Independent Opposite Sides (No Collision)
        if (!forwardTrunkRaw && backwardTrunkRaw) {
            results.backward = backwardTrunkRaw;
            return results;
        }
        if (forwardTrunkRaw && !backwardTrunkRaw) {
            results.forward = forwardTrunkRaw;
            return results;
        }

        if (forwardTrunkRaw && backwardTrunkRaw) {
            const fPort = forwardTrunkRaw.suggestedPort;
            const bPort = backwardTrunkRaw.suggestedPort;
            const isDistinct = fPort !== bPort;

            if (isDistinct) {
                // Independent Trunks - No Collision!
                results.forward = forwardTrunkRaw;
                results.backward = backwardTrunkRaw;
                return results;
            }
        }

        // 3. Collision Detected (Same Side/Port)
        // Apply Offset Strategy using Base Trunk (All Peers)
        const allPeers = [...forwardPeers, ...backwardPeers];
        // [T3] 加权拼接质心，避免再次遍历 allPeers
        let allCentroid: Point | undefined;
        if (forwardCentroid && backwardCentroid) {
            const fN = forwardPeers.length, bN = backwardPeers.length;
            allCentroid = {
                x: (forwardCentroid.x * fN + backwardCentroid.x * bN) / (fN + bN),
                y: (forwardCentroid.y * fN + backwardCentroid.y * bN) / (fN + bN),
            };
        } else {
            allCentroid = forwardCentroid ?? backwardCentroid;
        }
        const baseTrunk = this.calculateTreeTrunk(
            hubNode, allPeers, isManyToOne, config, layoutDirection, allCentroid, obstacles
        );

        // [Phase 3.5] Intelligent trunk assignment based on strategy
        let forwardUsesBase = true; // Default for 'forward-first'

        if (STRATEGY === 'count-based') {
            // Smart selection: more edges get the base trunk (closer to hub)
            if (backwardPeers.length > forwardPeers.length) {
                forwardUsesBase = false; // Backward has more, it gets base
            } else if (forwardPeers.length > backwardPeers.length) {
                forwardUsesBase = true; // Forward has more, it gets base
            } else {
                forwardUsesBase = true; // Equal count: forward priority
            }
        } else if (STRATEGY === 'backward-first') {
            forwardUsesBase = false; // Force backward to use base
        }

        // Assign trunks based on strategy decision
        if (forwardPeers.length > 0) {
            if (forwardUsesBase) {
                results.forward = baseTrunk;
            } else {
                // Forward gets offset trunk (Push OUTWARD)
                // [Optimization] Scale offset by peer count to avoid congestion
                const peerCount = forwardPeers.length;
                const dynamicSpacing = TRUNK_SEPARATION + Math.min(peerCount * 2, 40);

                let offset = dynamicSpacing;
                if (baseTrunk.suggestedPort === 'left' || baseTrunk.suggestedPort === 'top') {
                    offset = -dynamicSpacing;
                }
                const offsetAxis = baseTrunk.axis + offset;
                // [I-5] forwardTrunkRaw already has the correct range — no need to re-call calculateTreeTrunk.
                // Only axis/direction/suggestedPort change; range comes from the pre-computed forward trunk.
                results.forward = {
                    axis: offsetAxis,
                    direction: baseTrunk.direction,
                    range: forwardTrunkRaw!.range,
                    suggestedPort: baseTrunk.suggestedPort
                };
            }
        }

        if (backwardPeers.length > 0) {
            if (!forwardUsesBase) {
                results.backward = baseTrunk;
            } else {
                // Backward gets offset trunk
                // [Optimization] Scale offset by peer count to avoid congestion
                const peerCount = backwardPeers.length;
                const dynamicSpacing = TRUNK_SEPARATION + Math.min(peerCount * 2, 40);

                let offset = dynamicSpacing;
                if (baseTrunk.suggestedPort === 'left' || baseTrunk.suggestedPort === 'top') {
                    offset = -dynamicSpacing;
                }
                const offsetAxis = baseTrunk.axis + offset;
                // [I-5] backwardTrunkRaw already has the correct range — no need to re-call calculateTreeTrunk.
                results.backward = {
                    axis: offsetAxis,
                    direction: baseTrunk.direction,
                    range: backwardTrunkRaw!.range,
                    suggestedPort: baseTrunk.suggestedPort
                };
            }
        }

        return results;
    }
}
