/**
 * Geometry Classifier for Smart Edge Routing
 * 
 * This module provides geometry-based classification of node relationships
 * to enable intelligent port selection independent of layout configuration.
 * 
 * Based on industry standards from Mermaid, Draw.io, and yFiles.
 */

import { Position } from '../types/flow';

/**
 * 8-direction geometry classification based on relative node positions
 */
export type GeometryType =
    | 'horizontal-forward'    // Target is to the RIGHT (East, 0°)
    | 'horizontal-reverse'    // Target is to the LEFT (West, 180°)
    | 'vertical-forward'      // Target is BELOW (South, 90°)
    | 'vertical-reverse'      // Target is ABOVE (North, 270°)
    | 'diagonal-ne'           // Target is to the RIGHT-ABOVE (Northeast, 45°)
    | 'diagonal-nw'           // Target is to the LEFT-ABOVE (Northwest, 135°)
    | 'diagonal-se'           // Target is to the RIGHT-BELOW (Southeast, -45°)
    | 'diagonal-sw'           // Target is to the LEFT-BELOW (Southwest, -135°)
    | 'collocated';           // Nodes overlap or very close

/**
 * Port combination rules for each geometry type
 */
export interface PortRules {
    /** Strongly recommended combinations (e.g., ["R->L", "T->B"]) */
    preferred: string[];

    /** Forbidden combinations (semantic violations) */
    forbidden: string[];

    /** Neutral combinations (neither preferred nor forbidden) */
    neutral: string[];
}

/**
 * Options for advanced geometry analysis
 */
export interface GeometryAnalysisOptions {
    /** Source node dimensions (for aspect ratio analysis) */
    sourceSize?: { width: number; height: number };

    /** Target node dimensions (for aspect ratio analysis) */
    targetSize?: { width: number; height: number };

    /**
     * [S4-P11] Bounding boxes of source and target nodes (absolute positions).
     * When provided, collocated detection uses BOUNDARY GAP instead of center distance.
     * This prevents large overlapping nodes from being misclassified when their centers
     * are far apart but their edges actually touch or nearly touch.
     */
    sourceBounds?: { x: number; y: number; width: number; height: number };
    targetBounds?: { x: number; y: number; width: number; height: number };

    /** Enable distance-adaptive thresholds (default: true) */
    enableDistanceAdaptive?: boolean;

    /** Enable node shape awareness (default: false, experimental) */
    enableShapeAwareness?: boolean;
}

/**
 * Analyzes the geometric relationship between two nodes
 * 
 * @param dx - Horizontal distance (targetX - sourceX)
 * @param dy - Vertical distance (targetY - sourceY)
 * @param options - Advanced analysis options
 * @returns GeometryType classification
 */
export function analyzeGeometry(
    dx: number,
    dy: number,
    options?: GeometryAnalysisOptions
): GeometryType {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // [S4-P11] Collocated detection: prefer boundary-gap method when bounds are provided.
    // Center-to-center distance is misleading for large nodes — two 300×300 nodes with
    // centers 200px apart actually have a 0px gap between their edges.
    // Boundary gap = max(0, separation along each axis between the two bounding boxes).
    let isCollocated = false;
    if (options?.sourceBounds && options?.targetBounds) {
        const sb = options.sourceBounds;
        const tb = options.targetBounds;
        // Signed gap: negative means overlap
        const gapX = Math.max(sb.x, tb.x) - Math.min(sb.x + sb.width, tb.x + tb.width);
        const gapY = Math.max(sb.y, tb.y) - Math.min(sb.y + sb.height, tb.y + tb.height);
        // Nodes are collocated if they overlap or are within a small boundary margin
        const BOUNDARY_COLLOCATED_MARGIN = 20;
        isCollocated = gapX < BOUNDARY_COLLOCATED_MARGIN && gapY < BOUNDARY_COLLOCATED_MARGIN;
    } else {
        // Fallback: center-to-center threshold (legacy behavior)
        const avgNodeSize = options?.sourceSize && options?.targetSize
            ? (options.sourceSize.width + options.sourceSize.height +
                options.targetSize.width + options.targetSize.height) / 4
            : 100;
        const collocatedThreshold = Math.max(30, avgNodeSize * 0.3);
        isCollocated = absDx < collocatedThreshold && absDy < collocatedThreshold;
    }

    if (isCollocated) {
        return 'collocated';
    }

    // [INDUSTRY STANDARD] Distance-Adaptive Angle Thresholds
    // Based on yFiles and mxGraph best practices:
    // - Close nodes (<200px): WIDER orthogonal sectors (easier to snap to H/V)
    // - Medium nodes (200-500px): STANDARD sectors
    // - Far nodes (>500px): NARROWER orthogonal sectors (force clean routing)
    //
    // This ensures that nearby nodes are forgiving (allow slight misalignment),
    // while distant nodes enforce strict horizontal/vertical routing.
    const distance = Math.sqrt(dx * dx + dy * dy);
    const enableAdaptive = options?.enableDistanceAdaptive !== false; // Default true

    let verticalStart: number, verticalEnd: number;
    let horizontalRange: number;

    if (enableAdaptive) {
        const isCloseRange = distance < 200;
        const isFarRange = distance > 500;

        // Vertical sector: [verticalStart, verticalEnd] centered at 90°
        verticalStart = isCloseRange ? 40 : (isFarRange ? 50 : 45);
        verticalEnd = isCloseRange ? 140 : (isFarRange ? 130 : 135);

        // Horizontal sector: [-horizontalRange, +horizontalRange] centered at 0°/180°
        horizontalRange = isCloseRange ? 35 : (isFarRange ? 25 : 30);
    } else {
        // Standard thresholds (if adaptive disabled)
        verticalStart = 45;
        verticalEnd = 135;
        horizontalRange = 30;
    }

    // [INDUSTRY STANDARD] Dominant Direction Detection
    // Based on yFiles and mxGraph best practices:
    // If one dimension is significantly larger (0.5x) than the other,
    // treat as pure orthogonal (horizontal or vertical), even if angle suggests diagonal.
    //
    // [FIX P2] Hard angle dead zone: treat near-orthogonal angles as purely orthogonal.
    // If dy/dx < 0.15, the path is visually indistinguishable from horizontal.
    // If dx/dy < 0.15, same for vertical. Prevents port rule jitter at small angular deviations.
    if (absDx > 0.1 && absDy / absDx < 0.15) {
        return dx > 0 ? 'horizontal-forward' : 'horizontal-reverse';
    }
    if (absDy > 0.1 && absDx / absDy < 0.15) {
        return dy > 0 ? 'vertical-forward' : 'vertical-reverse';
    }

    // [OPTIMIZATION] Set threshold to 1.5 (was 3.0) to aggressively classify as orthogonal.
    // If one dimension is just 50% larger than the other, we treat it as orthogonal.
    // This prevents "Squarish" layouts from falling into Diagonal buckets which allow weird side-ports.
    // In diagramming, users rarely place things perfectly diagonally; they usually mean "Below" or "Right".
    const dominantRatio = Math.max(absDx, absDy) / (Math.min(absDx, absDy) + 0.1);

    if (dominantRatio > 1.5) {
        if (absDx > absDy) {
            // Horizontal dominant
            return dx > 0 ? 'horizontal-forward' : 'horizontal-reverse';
        } else {
            // Vertical dominant
            return dy > 0 ? 'vertical-forward' : 'vertical-reverse';
        }
    }

    // Calculate angle in degrees (-180 to 180)
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // 8-direction classification with ADAPTIVE orthogonal sectors
    // The sector widths now adapt based on distance (if enabled)
    //
    // Close range (<200px):  Vertical=[40°, 140°], Horizontal=±35°
    // Medium range (default): Vertical=[45°, 135°], Horizontal=±30°
    // Far range (>500px):    Vertical=[50°, 130°], Horizontal=±25°
    //
    // Diagonal sectors adjust accordingly to fill the gaps

    // Calculate diagonal boundaries based on adaptive thresholds
    const diagonalStart = horizontalRange;      // e.g., 30° or 35° or 25°
    const diagonalEnd = verticalStart;          // e.g., 45° or 40° or 50°
    const diagonalStartReverse = 180 - diagonalEnd;  // e.g., 135° or 140° or 130°
    const diagonalEndReverse = 180 - horizontalRange; // e.g., 150° or 145° or 155°

    let result: GeometryType;

    if (angle >= -horizontalRange && angle < horizontalRange) {
        result = 'horizontal-forward';  // East (0°)
    } else if (angle >= diagonalStart && angle < diagonalEnd) {
        result = 'diagonal-se';          // Southeast - width adapts
    } else if (angle >= verticalStart && angle < verticalEnd) {
        result = 'vertical-forward';     // South (90°) - width adapts
    } else if (angle >= diagonalStartReverse && angle < diagonalEndReverse) {
        result = 'diagonal-sw';          // Southwest - width adapts
    } else if (angle >= diagonalEndReverse || angle < -(180 - horizontalRange)) {
        result = 'horizontal-reverse';   // West (180°)
    } else if (angle >= -(180 - diagonalEnd) && angle < -(180 - diagonalStart)) {
        result = 'diagonal-nw';          // Northwest - width adapts
    } else if (angle >= -verticalEnd && angle < -verticalStart) {
        result = 'vertical-reverse';     // North (-90°) - width adapts
    } else if (angle >= -diagonalEnd && angle < -diagonalStart) {
        result = 'diagonal-ne';          // Northeast - width adapts
    } else {
        // Fallback (should never reach here if angle is always within -180 to 180)
        result = 'collocated';
    }

    return result;
}

/**
 * Returns port selection rules for a given geometry type
 * 
 * Rules are based on industry best practices:
 * - TB Layout Convention: Top = Input, Bottom = Output
 * - Reverse Flow: Use side ports (Left/Right) to avoid semantic conflicts
 * - Diagonal: Prefer cross-side routing (e.g., R->L when moving right)
 * 
 * @param type - Geometry classification
 * @returns Port selection rules
 */
export function getPortRulesForGeometry(type: GeometryType): PortRules {
    const rules: Record<GeometryType, PortRules> = {
        /**
         * HORIZONTAL FORWARD (Target is to the RIGHT)
         * Standard left-to-right flow
         */
        'horizontal-forward': {
            preferred: [
                'R->L',  // Primary: Right exit -> Left entry (Direct, 0 bends)
                'B->T',  // Secondary: Bottom -> Top (2 bends, fallback)
                'T->B'   // Secondary: Top -> Bottom (2 bends, fallback)
            ],
            forbidden: [
                'L->R',  // Reverse direction
                'L->L',  // Same-side horizontal
                'R->R'   // Same-side horizontal
            ],
            neutral: [] // [STRICT] All valid ports are in preferred
        },

        /**
         * HORIZONTAL REVERSE (Target is to the LEFT)
         * Feedback loop / reverse flow
         * [S5-P7] Corrected priority: R->L is the direct L-shape (0-1 bends) when target is left.
         * L->R is the cross-over path (2 bends). T->T/B->B are U-turn fallbacks (3 bends).
         */
        'horizontal-reverse': {
            preferred: [
                'R->L',  // Primary: Right exit → Left entry (shortest L-shape when target is left)
                'L->R',  // Secondary: Left exit → Right entry (cross-over, 2 bends)
                'T->T',  // Fallback: U-shape top (when right side is blocked)
                'B->B'   // Fallback: U-shape bottom (when right side is blocked)
            ],
            forbidden: [
                'R->R',  // Same-side → large arc
                'L->L',  // Same-side → large arc
                'T->B',  // Vertical forward (wrong direction for horizontal reverse)
                'B->T'   // Vertical forward (wrong direction for horizontal reverse)
            ],
            neutral: [] // [STRICT]
        },

        /**
         * VERTICAL FORWARD (Target is BELOW)
         * Standard top-to-bottom flow
         */
        'vertical-forward': {
            preferred: [
                'B->T',  // Primary: Bottom -> Top (Direct, 0 bends)
                'L->R',  // Secondary: Left -> Right (2 bends, fallback)
                'R->L'   // Secondary: Right -> Left (2 bends, fallback)
            ],
            forbidden: [
                'T->B',  // Reverse direction
                'T->T',  // Same-side vertical
                'B->B'   // Same-side vertical
            ],
            neutral: [] // [STRICT]
        },

        /**
         * VERTICAL REVERSE (Target is ABOVE)
         * Feedback loop — source is BELOW target
         * 
         * [FIX] 原来 forbidden 包含 B->T，这是错的。
         * Decision(Bottom) → 上方 Start/End(Top) 是 2 弯的合理路径（Z形）。
         * 禁止 B->T 导致路由器被迫选 L->L 或 R->R C形，形成矩形环路。
         */
        'vertical-reverse': {
            preferred: [
                'L->L',  // Primary: Left->Left (C-Shape, 2 bends)
                'R->R',  // Primary: Right->Right (C-Shape, 2 bends)
                'B->T',  // [FIX] Secondary: Bottom->Top (Z-Shape 2 bends, was wrongly forbidden)
                'L->R',  // Secondary: Left->Right (cross-side)
                'R->L',  // Secondary: Right->Left (cross-side)
            ],
            forbidden: [
                'T->T', 'T->B',  // Top as source output is wrong direction
                'B->B',          // Same-side bottom creates unnecessary U-turn
                'T->L', 'T->R',  // Top as source: semantically wrong for upward flow
            ],
            neutral: []
        },

        /**
         * DIAGONAL NE (Target is to the RIGHT-ABOVE)
         * Diagonal reverse with horizontal component
         * OPTIMIZED: Simplified preferred list (yFiles standard)
         */
        'diagonal-ne': {
            preferred: [
                'R->L',  // Primary: Cross-side horizontal
                'T->B',  // Secondary: Top to Bottom (if target has Bottom input) - Valid L-shape
                'R->B',  // L-shape: Right Exit -> Bottom Entry
                'T->L'   // L-shape: Top Exit -> Left Entry
            ],
            forbidden: [
                'R->R',  // Same-side creates arc
                'L->L',  // Same-side creates arc
                // [FIX] 移除 'T->L'——它同时出现在 preferred 和 forbidden 里（矛盾）
                'T->R',  // Top as output
                'B->T'   // Bottom to Top (Vertical Forward in Reverse Geometry?)
            ],
            neutral: [] // [STRICT] Removed mixed ports
        },

        /**
         * DIAGONAL NW (Target is to the LEFT-ABOVE)
         * Diagonal reverse with horizontal component
         * OPTIMIZED: Simplified preferred list (yFiles standard)
         */
        'diagonal-nw': {
            preferred: [
                'L->R',  // Primary: Cross-side horizontal
                'T->B',  // Secondary: Top to Bottom - Valid L-shape
                'L->B',  // L-shape: Left Exit -> Bottom Entry
                'T->R'   // L-shape: Top Exit -> Right Entry
            ],
            forbidden: [
                'L->L',  // Same-side creates arc
                'R->R',  // Same-side creates arc
                'T->L',  // Top as output (exit top going left = awkward)
                // [FIX S5-P3] Removed 'T->R' — it was listed in both preferred AND forbidden
                // (contradiction). forbidden took priority, making the preferred entry dead code.
                // T->R is a valid L-shape for diagonal-nw and should be allowed.
                'B->T'   // Bottom to Top (wrong direction)
            ],
            neutral: [] // [STRICT] Removed mixed ports
        },

        /**
         * DIAGONAL SE (Target is to the RIGHT-BELOW)
         * Diagonal forward - Logic optimized for Vertical Flow
         * OPTIMIZED: Simplified preferred list (yFiles standard)
         */
        'diagonal-se': {
            preferred: [
                'B->T',  // Primary: Vertical dominant (natural flow)
                'R->L',  // Secondary: Horizontal dominant (Valid L-shape)
                'B->L',  // L-shape: Bottom Exit -> Left Entry
                'R->T'   // L-shape: Right Exit -> Top Entry
            ],
            forbidden: [
                'L->R',  // Reverse horizontal
                'R->R',  // Same-side
                'T->B',  // Reverse vertical
                'B->B',  // Same-side vertical
                'T->T'   // Top to Top (U-turn)
            ],
            neutral: [] // [STRICT] Removed mixed ports
        },

        /**
         * DIAGONAL SW (Target is to the LEFT-BELOW)
         * Diagonal forward - Logic optimized for Vertical Flow
         * OPTIMIZED: Simplified preferred list (yFiles standard)
         */
        'diagonal-sw': {
            preferred: [
                'B->T',  // Primary: Vertical dominant (natural flow)
                'L->R',  // Secondary: Horizontal dominant (Valid L-shape)
                'B->R',  // L-shape: Bottom Exit -> Right Entry
                'L->T'   // L-shape: Left Exit -> Top Entry
            ],
            forbidden: [
                'R->L',  // Reverse horizontal
                'L->L',  // Same-side
                'T->B',  // Reverse vertical
                'B->B',  // Same-side vertical
                'T->T'   // Top to Top
            ],
            neutral: [] // [STRICT] Removed mixed ports
        },

        /**
         * COLLOCATED (Nodes overlap or very close)
         * [S5-P8] Give 4 direct-connect combinations priority so that collocated nodes
         * don't randomly flip ports when all path costs are near-zero (tie-breaking by array order).
         * The remaining 12 combinations are neutral (rely on path length).
         */
        'collocated': {
            preferred: [
                'R->L',  // Horizontal direct connect
                'B->T',  // Vertical direct connect
                'L->R',  // Horizontal reverse
                'T->B',  // Vertical reverse
            ],
            forbidden: [],
            neutral: [
                'L->L', 'R->R', 'T->T', 'B->B',
                'R->T', 'R->B', 'L->T', 'L->B',
                'T->L', 'T->R', 'B->L', 'B->R'
            ]
        }
    };

    return rules[type];
}

/**
 * Converts Position enum pair to string representation (e.g., "R->L")
 */
export function portCombinationToString(sourcePos: Position, targetPos: Position): string {
    const posToChar = (p: Position): string => {
        switch (p) {
            case Position.Top: return 'T';
            case Position.Bottom: return 'B';
            case Position.Left: return 'L';
            case Position.Right: return 'R';
            default: return '?';
        }
    };

    return `${posToChar(sourcePos)}->${posToChar(targetPos)}`;
}
