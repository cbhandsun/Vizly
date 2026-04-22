/**
 * Port Selector
 * 
 * Handles smart port selection, dynamic port sliding, and fan-out distribution.
 */

import { Point, Rectangle } from '../../algorithms/geometryUtils';
import { Position, UnifiedRoutingConfig } from '../../types/routing';
import { selectOptimalPorts } from '../../algorithms/costAwarePorts';


export class PortSelector {
    private config: UnifiedRoutingConfig;

    constructor(config: UnifiedRoutingConfig) {
        this.config = config;
    }

    /**
     * Get optimal ports for a connection.
     * [S5-P9] constrainedSourcePos / constrainedTargetPos: when provided, locks that port side
     * and only optimizes the other. Used for Bus peers to prevent hub-side ports from
     * overriding the trunk axis decision while still applying crossing avoidance to peer side.
     */
    selectPorts(
        sourceRect: Rectangle,
        targetRect: Rectangle,
        obstacles: Rectangle[],
        options: {
            effectiveDir: string;
            portUsage?: Record<string, number>;
            sourceId: string;
            targetId: string;
            /** [FIX P0] Already-routed line segments for crossing avoidance at port selection layer */
            lineObstacles?: import('../../algorithms/pathfinding').LineObstacle[];
            /** [S5-P9] When set, locks the source port and only optimizes the target port */
            constrainedSourcePos?: Position;
            /** [S5-P9] When set, locks the target port and only optimizes the source port */
            constrainedTargetPos?: Position;
        }
    ) {
        return selectOptimalPorts(
            sourceRect,
            targetRect,
            obstacles,
            options.lineObstacles ?? [], // [FIX P0] Pass pending edge segments so CROSSING_PENALTY is effective
            {
                ...this.config.portSelection,
                layoutDirection: options.effectiveDir as 'TB' | 'LR' | 'BT' | 'RL',
                portUsage: options.portUsage,
                sourceId: options.sourceId,
                targetId: options.targetId,
                enableDynamicPorts: this.config.portSelection.enableDynamicPorts,
                portSlidePadding: this.config.portSelection.portSlidePadding,
                // [S5-P9] Constrained port pass-through
                constrainedSourcePos: options.constrainedSourcePos,
                constrainedTargetPos: options.constrainedTargetPos,
            }
        );
    }


    /**
     * Map Position enum to string direction (t, b, l, r)
     */
    mapPosToDir(p: Position): string {
        if (p === Position.Top) return 't';
        if (p === Position.Bottom) return 'b';
        if (p === Position.Left) return 'l';
        return 'r';
    }

    /**
     * Get slide bounds for a rectangle with padding
     */
    getSlideBounds(r: Rectangle) {
        const padding = Math.max(0, this.config.portSelection.portSlidePadding ?? 0);
        const minX = r.x + padding;
        const maxX = r.x + r.width - padding;
        const minY = r.y + padding;
        const maxY = r.y + r.height - padding;

        return {
            minX: Math.min(minX, maxX),
            maxX: Math.max(minX, maxX),
            minY: Math.min(minY, maxY),
            maxY: Math.max(minY, maxY)
        };
    }

    /**
     * Calculate port coordinate with dynamic sliding towards target center
     */
    getPortPointWithSlide(
        rect: Rectangle,
        pos: Position,
        targetCenter?: Point
    ): Point {
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        // [FIX P3] Self-loop: targetCenter equals the node's own center → dynamic sliding
        // would push the port inward. Force static center ports for self-loop edges.
        const isSelfLoop = this.config.portSelection?.sourceId !== undefined &&
            this.config.portSelection.sourceId === this.config.portSelection.targetId;
        const enableSlide = Boolean(this.config.portSelection.enableDynamicPorts && targetCenter && !isSelfLoop);

        if (!enableSlide || !targetCenter) {
            if (pos === Position.Top) return { x: cx, y: rect.y };
            if (pos === Position.Bottom) return { x: cx, y: rect.y + rect.height };
            if (pos === Position.Left) return { x: rect.x, y: cy };
            return { x: rect.x + rect.width, y: cy };
        }

        const bounds = this.getSlideBounds(rect);
        // [FIX] Strict Centering: Constrain the dynamic sliding to the central 50% of the node.
        // [S5-P5] Additional pixel cap: even on wide nodes, port won't slide more than MAX_SLIDE_HALF px
        // from center. Prevents long parallel-line artifacts on 600px+ nodes.
        // Note: cx/cy are already declared at L88-89 (reused here)
        const MAX_SLIDE_HALF = 60;
        const strictMinX = Math.max(bounds.minX, rect.x + rect.width * 0.25, cx - MAX_SLIDE_HALF);
        const strictMaxX = Math.min(bounds.maxX, rect.x + rect.width * 0.75, cx + MAX_SLIDE_HALF);
        const strictMinY = Math.max(bounds.minY, rect.y + rect.height * 0.25, cy - MAX_SLIDE_HALF);
        const strictMaxY = Math.min(bounds.maxY, rect.y + rect.height * 0.75, cy + MAX_SLIDE_HALF);


        // Safety check for small nodes
        const safeMinX = Math.min(strictMinX, strictMaxX);
        const safeMaxX = Math.max(strictMinX, strictMaxX);
        const safeMinY = Math.min(strictMinY, strictMaxY);
        const safeMaxY = Math.max(strictMinY, strictMaxY);

        const clampX = (val: number) => Math.max(safeMinX, Math.min(safeMaxX, val));
        const clampY = (val: number) => Math.max(safeMinY, Math.min(safeMaxY, val));

        if (pos === Position.Top) return { x: clampX(targetCenter.x), y: rect.y };
        if (pos === Position.Bottom) return { x: clampX(targetCenter.x), y: rect.y + rect.height };
        if (pos === Position.Left) return { x: rect.x, y: clampY(targetCenter.y) };
        return { x: rect.x + rect.width, y: clampY(targetCenter.y) };
    }

    /**
     * Calculate position with fan-out/slotting distribution
     */
    getDistributedPortPoint(
        rect: Rectangle,
        pos: Position,
        index: number,
        count: number,
        targetCenter?: Point
    ): Point {
        if (count <= 1) {
            return this.getPortPointWithSlide(rect, pos, targetCenter);
        }

        const isVerticalPort = pos === Position.Top || pos === Position.Bottom;
        // [FIX P2] Dynamic port spread: scale with node extent to avoid overflow on small nodes
        // and over-crowding on large nodes.
        // [S5-P6] Upper bound is now dynamic: min(nodeExtent/4, 40) instead of fixed 30px.
        // Wide nodes (400px+) get more breathing room between fan-out ports.
        const nodeExtent = isVerticalPort ? rect.width : rect.height;
        const dynamicMax = Math.min(40, nodeExtent / 4);
        const PORT_SPREAD = Math.max(12, Math.min(dynamicMax, nodeExtent / Math.max(count + 1, 2)));

        const sideOffset = (index - (count - 1) / 2) * PORT_SPREAD;
        const basePt = this.getPortPointWithSlide(rect, pos, targetCenter);
        const bounds = this.getSlideBounds(rect);
        const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

        if (pos === Position.Left || pos === Position.Right) {
            return {
                x: basePt.x,
                y: clamp(basePt.y + sideOffset, bounds.minY, bounds.maxY)
            };
        } else {
            return {
                x: clamp(basePt.x + sideOffset, bounds.minX, bounds.maxX),
                y: basePt.y
            };
        }
    }
}
