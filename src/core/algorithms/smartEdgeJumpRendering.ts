import type { Node, Edge } from '@xyflow/react';
import type { Point } from './pathfinding';
import { getJumpPoints } from './smartEdgeGeometryCore';

const LONG_LABEL_SEGMENT_THRESHOLD = 480;
const LONG_LABEL_SOURCE_DISTANCE = 180;


export function createRoundedPathWithJumps(
    points: Point[],
    borderRadius: number,
    jumpRadius: number,
    allOtherEdges: Edge[],
    nodes: Node[],
    currentEdgeId: string,
    config: { sourceOffset: number, targetOffset: number }
): string {
    // 去除相邻的重复点
    const dedupedPoints: Point[] = [];
    if (points.length > 0) {
        dedupedPoints.push(points[0]);
        for (let i = 1; i < points.length; i++) {
            const prev = dedupedPoints[dedupedPoints.length - 1];
            const curr = points[i];
            if (Math.abs(prev.x - curr.x) > 1 || Math.abs(prev.y - curr.y) > 1) {
                dedupedPoints.push(curr);
            }
        }
    }
    points = dedupedPoints;

    if (points.length < 2) return "";

    let path = "M " + points[0].x + " " + points[0].y;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        let startRatio = 0;
        // [FIX] Don't apply radius offset to the first segment (i=1) to keep start point exact
        if (i > 1) startRatio = Math.min(borderRadius, len / 2) / len;

        let endRatio = 0;
        // [FIX] Don't apply radius offset to the last segment to keep end point exact
        if (i < points.length - 1) endRatio = Math.min(borderRadius, len / 2) / len;

        // [FIX] Also ensure the second segment starts correctly
        // If this is the second point and path has more, we should still draw from exact start
        if (startRatio + endRatio > 1) {
            startRatio = 0.5;
            endRatio = 0.5;
        }

        // [FIX] For segments connected to the endpoints, ensure orthogonal entry
        // The first point (i=1) should be drawn straight from point[0]
        // The drawStart for the FIRST segment should be exactly at points[0]
        const isFirstSegment = i === 1;
        const isLastSegment = i === points.length - 1;

        // [FIX] For first segment, drawStart should be exact start point (no corner adjustment)
        const drawStart = isFirstSegment ? { x: prev.x, y: prev.y } : {
            x: prev.x + dx * startRatio,
            y: prev.y + dy * startRatio
        };

        // [FIX] For last segment, drawEnd should be exact end point
        const drawEnd = isLastSegment ? { x: curr.x, y: curr.y } : {
            x: curr.x - dx * endRatio,
            y: curr.y - dy * endRatio
        };

        // [NEW] Line Jump Logic (Restored & Optimized)
        // 1. Calculate Jumps for this segment
        const jumps = getJumpPoints(drawStart, drawEnd, allOtherEdges, nodes, currentEdgeId, config);

        // 2. Draw segment with jumps
        if (jumps.length === 0) {
            path += " L " + drawEnd.x + " " + drawEnd.y;
        } else {
            const isHorizontal = Math.abs(drawEnd.y - drawStart.y) < 0.1;

            jumps.forEach(jump => {
                // Check if jump is within the drawn segment (accounting for radius)
                // We need space for the jump arc (jumpRadius * 2 width)
                const jr = jumpRadius;

                // Validate jump fit
                const distTotal = isHorizontal
                    ? Math.abs(drawEnd.x - drawStart.x)
                    : Math.abs(drawEnd.y - drawStart.y);
                const distToJump = isHorizontal
                    ? Math.abs(jump.x - drawStart.x)
                    : Math.abs(jump.y - drawStart.y);

                // Skip if jump is too close to start or end (clipping with corner)
                if (distToJump < jr || distToJump > distTotal - jr) return;

                // Calculate start/end of the arc
                let arcStart: Point;
                let arcEnd: Point;
                let control: Point;

                if (isHorizontal) {
                    const sign = drawEnd.x > drawStart.x ? 1 : -1;
                    arcStart = { x: jump.x - jr * sign, y: jump.y };
                    arcEnd = { x: jump.x + jr * sign, y: jump.y };
                    // Control point for semi-circle (up or down? usually up)
                    // If horizontal, jump goes "up" (y-axis)
                    control = { x: jump.x, y: jump.y - jr * 1.5 }; // 1.5 for slightly flatter/rounder arc
                } else {
                    const sign = drawEnd.y > drawStart.y ? 1 : -1;
                    arcStart = { x: jump.x, y: jump.y - jr * sign };
                    arcEnd = { x: jump.x, y: jump.y + jr * sign };
                    // If vertical, jump goes "left" or "right"? Usually "left" (-x)
                    control = { x: jump.x - jr * 1.5, y: jump.y };
                }

                // Line to arc start
                path += " L " + arcStart.x + " " + arcStart.y;
                // Arc
                path += " Q " + control.x + " " + control.y + " " + arcEnd.x + " " + arcEnd.y;
            });

            // Final line to segment end
            path += " L " + drawEnd.x + " " + drawEnd.y;
        }

        // 3. Draw Corner (unchanged)
        if (i < points.length - 1) {
            const next = points[i + 1];
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            const radius = Math.min(borderRadius, len / 2, len2 / 2);

            const arcEndRatio = radius / len2;
            const arcEnd = {
                x: curr.x + dx2 * arcEndRatio,
                y: curr.y + dy2 * arcEndRatio
            };
            path += " Q " + curr.x + " " + curr.y + " " + arcEnd.x + " " + arcEnd.y;
        }
    }

    return path;
}

// [NEW] 智能标签位置计算 - 优化版
// 策略：优先选择"最长线段"的中心，而不是整个路径的几何中心。
// 原因：路径几何中心往往落在转角或短连接线上，导致标签位置尴尬。
export function getSmartLabelPosition(points: Point[]): { x: number, y: number } {
    if (!points || points.length < 2) return { x: 0, y: 0 };

    // 0. Calculate Visual Center (Bounding Box Center)
    // This is often more "central" to the shape than the path-length center.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const visualCenter = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2
    };

    // 1. Analyze Segments
    let maxLen = -1;
    const segments: { index: number, len: number, mid: Point, isHorizontal: boolean }[] = [];

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len > maxLen) maxLen = len;

        segments.push({
            index: i,
            len: len,
            mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
            isHorizontal: Math.abs(dy) < 1 // Simple horizontal check
        });
    }

    if (maxLen <= 0) return points[0];

    // 2. Filter & Score Candidates
    // We consider segments that are "significant" enough to hold a label.
    // Threshold: At least 50% of the longest segment OR explicitly long (>60px)
    const candidates = segments.filter(s => s.len >= maxLen * 0.5 || s.len > 60);

    let bestCandidate = candidates.length > 0 ? candidates[0] : segments.reduce((prev, curr) => (prev.len > curr.len) ? prev : curr); // Fallback to max len if no candidates
    let bestScore = -Infinity;

    for (const seg of candidates) {
        // Score Components:
        // A. Visual Centrality (Secondary factor)
        // [FIX] Reduced weight (1000 -> 500). We prefer structural alignment (backbone) over pure geometric center.
        const distToVisualCenter = Math.sqrt(
            Math.pow(seg.mid.x - visualCenter.x, 2) +
            Math.pow(seg.mid.y - visualCenter.y, 2)
        );
        const centralityScore = 500 / (1 + distToVisualCenter);

        // B. Length Bonus (Longer is better)
        // [FIX] Increased cap (200 -> 1000) to properly reward very long backbones over medium segments.
        const lengthScore = Math.min(seg.len, 500) * 2;

        // C. Orientation Bonus (Horizontal is better for reading)
        // [FIX] Increased to 250. Horizontal segments are significantly better for standard horizontal text.
        const orientationBonus = seg.isHorizontal ? 250 : 0;

        // D. Edge Penalty (Avoid first/last segments)
        // Keep high penalty to clear the ports.
        const isTerminal = (seg.index === 0 || seg.index === points.length - 2);
        const terminalPenalty = isTerminal ? -500 : 0;

        // E. Max Length Bonus
        // [FIX] Increased to 1000. The "Backbone" should almost always win.
        const maxLenBonus = (seg.len === maxLen) ? 1000 : 0;

        // Final Score
        const totalScore = centralityScore + lengthScore + orientationBonus + terminalPenalty + maxLenBonus;

        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestCandidate = seg;
        }
    }

    // A connector label at the geometric midpoint of an oversized swimlane
    // backbone looks detached from the decision that owns it. Keep the normal
    // midpoint for ordinary segments, but bound the reading distance on very
    // long segments. The candidate direction follows source -> target, so the
    // label remains close enough to its semantic origin while still sitting on
    // the routed path for obstacle avoidance and interaction.
    if (bestCandidate.len > LONG_LABEL_SEGMENT_THRESHOLD) {
        const start = points[bestCandidate.index];
        const end = points[bestCandidate.index + 1];
        const ratio = LONG_LABEL_SOURCE_DISTANCE / bestCandidate.len;
        return {
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio,
        };
    }

    return { x: bestCandidate.mid.x, y: bestCandidate.mid.y };
}
