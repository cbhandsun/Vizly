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
        layoutDirection: string = 'LR'
    ): { axis: number; direction: 'horizontal' | 'vertical'; range: { min: number; max: number }; suggestedPort: 'top' | 'bottom' | 'left' | 'right' } {
        const hubCenter = {
            x: hubNode.x + hubNode.width / 2,
            y: hubNode.y + hubNode.height / 2
        };

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
        const peersCenter = this.calculateCentroid(peerNodes);
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

            if (isLeft) {
                // Trunk on Left: Between PeersMaxX and HubMinX
                const minSafe = hubNode.x - spacing;
                const ideal = (pBounds.maxX + hubNode.x) / 2;
                // If peers are overlapping or too close, respect minSafe
                // If peers are far, center the trunk
                axis = Math.min(ideal, minSafe);
                suggestedPort = 'left';
            } else {
                // Trunk on Right: Between HubMaxX and PeersMinX
                const minSafe = hubNode.x + hubNode.width + spacing;
                const ideal = (pBounds.minX + hubNode.x + hubNode.width) / 2;
                axis = Math.max(ideal, minSafe);
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
            // [S4-P12] Guard: range must always be finite (peerNodes was verified non-empty above)
            if (!isFinite(range.min) || !isFinite(range.max)) {
                range.min = hubCenter.y;
                range.max = hubCenter.y;
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

            if (isTop) {
                // Trunk on Top: midpoint between peers' bottom and hub's top
                const minSafe = hubNode.y - spacing;
                const ideal = (pBounds.maxY + hubNode.y) / 2;
                axis = Math.min(ideal, minSafe);
                suggestedPort = 'top';
            } else {
                // Trunk on Bottom: midpoint between hub's bottom and peers' top
                const minSafe = hubNode.y + hubNode.height + spacing;
                const ideal = (pBounds.minY + hubNode.y + hubNode.height) / 2;
                axis = Math.max(ideal, minSafe);
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
            // [S4-P12] Guard: range must always be finite
            if (!isFinite(range.min) || !isFinite(range.max)) {
                range.min = hubCenter.x;
                range.max = hubCenter.x;
            }

            // [ASSERT] suggestedPort must be assigned by both branches above.
            // If not, it means a new branch was added without port logic — fail loudly.
            if (!suggestedPort) {
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
        layoutDirection: string = 'LR'
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
        const forwardTrunkRaw = forwardPeers.length > 0
            ? this.calculateTreeTrunk(hubNode, forwardPeers, isManyToOne, config, layoutDirection)
            : undefined;

        const backwardTrunkRaw = backwardPeers.length > 0
            ? this.calculateTreeTrunk(hubNode, backwardPeers, isManyToOne, config, layoutDirection)
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
        const baseTrunk = this.calculateTreeTrunk(
            hubNode,
            allPeers,
            isManyToOne,
            config,
            layoutDirection
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
