import type { Rectangle, Point } from './pathfinding';
import { isPathBlocked } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';
import { collapseCollinearBacktracks } from './smartEdgeBacktrackSimplification';


/**
 * Aggressively smooths short segments by converting them into diagonal shortcuts.
 * Solves "Hard Corner" issues where orthogonal segments are too short for fillet.
 */
export function smoothShortSegments(
    points: Point[],
    threshold: number = 30,
    obstacles: Rectangle[] | SpatialIndex = []
): Point[] {
    if (points.length < 3) return points;
    const res = points.map(p => ({ ...p }));
    let changed = true;
    let maxIter = 3;

    const isBlocked = (pts: Point[]) => isPathBlocked(pts, obstacles, 10);

    while (changed && maxIter > 0) {
        changed = false;
        maxIter--;

        // Check for short segments
        for (let i = 0; i < res.length - 1; i++) {
            const pStart = res[i];
            const pEnd = res[i + 1];
            const dist = Math.abs(pStart.x - pEnd.x) + Math.abs(pStart.y - pEnd.y);

            if (dist < threshold && dist > 0.1) {
                // Short segment detected!

                // [FIX] NEVER smooth the first or last segments directly if it changes start/end angle.
                // We want to preserve Orthogonal Port connections.

                // Case 1: Start Segment (i=0)
                // P0 -> P1 is short. P0 is fixed source.
                // If we remove P1, we get P0 -> P2.
                // Unless P0->P2 is also orthogonal, this creates a diagonal exit.
                if (i === 0) {
                    // Skip smoothing start segment to preserve orthogonal exit
                    continue;
                }

                // Case 2: End Segment (i = len-2)
                // P(n-1) -> P(n) is short. P(n) is fixed target.
                // If we remove P(n-1), we get P(n-2) -> P(n).
                // Unless P(n-2)->P(n) is also orthogonal, this creates a diagonal entry.
                else if (i === res.length - 2) {
                    // Skip smoothing end segment to preserve orthogonal entry
                    continue;
                }

                // Case 3: Middle Segment
                // P(i) -> P(i+1) is short.
                // Try to replace with Midpoint?
                // Or try P(i-1) -> P(i+1) (removing P(i))
                // Or try P(i) -> P(i+2) (removing P(i+1))
                else if (i > 0 && i < res.length - 2) {
                    const pPrev = res[i - 1];
                    const pNext = res[i + 2];

                    // Try bridging P(i-1) -> P(i+1) (Cutting corner at P(i))
                    if (!isBlocked([pPrev, pEnd])) {
                        res.splice(i, 1); // Remove P(i)
                        changed = true;
                        i--;
                        continue;
                    }

                    // Try bridging P(i) -> P(i+2) (Cutting corner at P(i+1))
                    if (!isBlocked([pStart, pNext])) {
                        res.splice(i + 1, 1); // Remove P(i+1)
                        changed = true;
                        i--;
                        continue;
                    }
                }
            }
        }
    }
    return res;
}

// [NEW] Industry Standard Corner Filleting
// Uses Quadratic Bezier curves for smooth transitions between orthogonal segments.
export function createFilletedPath(
    points: Point[],
    cornerRadius: number = 12
): string {
    if (!points || points.length < 2) return '';

    // 1. Remove consecutive duplicate points (Tolerance: 0.5px)
    // Duplicate points cause zero-length segments which force radius to 0
    // Rendering normalization must never mutate the routing model. Several
    // later passes snap coordinates and collapse short bridges in place, so
    // keep a private point graph instead of retaining caller-owned objects.
    const cleanPoints: Point[] = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length; i++) {
        const prev = cleanPoints[cleanPoints.length - 1];
        const curr = points[i];
        const dist = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
        if (dist > 0.5) {
            cleanPoints.push({ x: curr.x, y: curr.y });
        }
    }

    if (cleanPoints.length < 2) return '';

    const normalizedPoints = collapseCollinearBacktracks(cleanPoints);
    if (normalizedPoints.length < 2) return '';

    // [FIX] Snap near-orthogonal segments to perfect orthogonal BEFORE generating arcs.
    // Eliminates diagonal artifacts caused by fractional handle/port coordinate misalignment (e.g. dx=9, dy=36).
    // This is the final defense layer — all SVG rendering paths (Worker, hydration, channel) converge here.
    const microAxisSnap = 1;
    for (let i = 0; i < normalizedPoints.length - 1; i++) {
        const a = normalizedPoints[i];
        const b = normalizedPoints[i + 1];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dx <= microAxisSnap && dy > microAxisSnap) {
            b.x = a.x;
            continue;
        }
        if (dy <= microAxisSnap && dx > microAxisSnap) {
            b.y = a.y;
            continue;
        }
        if (dx > microAxisSnap && dy > microAxisSnap) {
            // Use proportional threshold: if the minor-axis is <15% of major-axis
            // AND the minor-axis is <25px (safety cap), snap to orthogonal.
            // This handles A* grid quantization artifacts (~20px) on long segments
            // while preserving intentional diagonal routing on short ones.
            const ratio = Math.min(dx, dy) / Math.max(dx, dy);
            const minorAxis = Math.min(dx, dy);
            if (ratio < 0.16 && minorAxis < 25) {
                if (dx < dy) {
                    // Almost vertical — snap x
                    b.x = a.x;
                } else {
                    // Almost horizontal — snap y
                    b.y = a.y;
                }
            }
        }
    }

    // [FIX] Micro-jog elimination: remove S-shaped deviations ≤ 3px offset.
    // Pattern: two consecutive turns with tiny lateral offset (e.g., x shifts from 2531 to 2533).
    // These create visually meaningless bends and sub-pixel arc artifacts.
    // Strategy: scan for 3-point windows A→B→C where one axis drifts ≤3px total,
    // then snap B to align with A on that axis, effectively straightening the path.
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < normalizedPoints.length - 2; i++) {
            const a = normalizedPoints[i];
            const b = normalizedPoints[i + 1];
            const c = normalizedPoints[i + 2];

            // Check for vertical micro-jog: A.x ≈ C.x but B.x is slightly off
            const xDriftAC = Math.abs(a.x - c.x);
            const xDriftAB = Math.abs(a.x - b.x);
            const xDriftBC = Math.abs(b.x - c.x);
            if (xDriftAC <= 3 && (xDriftAB > 0.3 || xDriftBC > 0.3) && xDriftAB <= 3 && xDriftBC <= 3) {
                // All three points are within 3px on X — snap to a single X
                const avgX = a.x; // anchor to first point
                b.x = avgX;
                c.x = avgX;
            }

            // Check for horizontal micro-jog: A.y ≈ C.y but B.y is slightly off
            const yDriftAC = Math.abs(a.y - c.y);
            const yDriftAB = Math.abs(a.y - b.y);
            const yDriftBC = Math.abs(b.y - c.y);
            if (yDriftAC <= 3 && (yDriftAB > 0.3 || yDriftBC > 0.3) && yDriftAB <= 3 && yDriftBC <= 3) {
                const avgY = a.y;
                b.y = avgY;
                c.y = avgY;
            }
        }
    }

    // [FIX] Second collinear cleanup: the micro-jog pass above may have created
    // new collinear sequences (e.g., three points now on the same vertical line).
    // Re-run collapse to eliminate them before arc generation.
    const finalPoints = collapseCollinearBacktracks(normalizedPoints);
    if (finalPoints.length < 2) return '';

    const shortThreshold = cornerRadius * 2;
    let shortChanged = false;

    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i + 3 < finalPoints.length; i++) {
            const a = finalPoints[i];
            const b = finalPoints[i + 1];
            const c = finalPoints[i + 2];
            const d = finalPoints[i + 3];
            const canMoveWindowEnd = i + 3 < finalPoints.length - 1;

            const firstVertical = Math.abs(a.x - b.x) < 1;
            const bridgeHorizontal = Math.abs(b.y - c.y) < 1;
            const secondVertical = Math.abs(c.x - d.x) < 1;
            if (firstVertical && bridgeHorizontal && secondVertical) {
                const bridgeLength = Math.abs(b.x - c.x);
                const sameDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
                if (canMoveWindowEnd && sameDirection && bridgeLength > 0.5 && bridgeLength < shortThreshold) {
                    finalPoints.splice(i + 1, 3, { x: a.x, y: d.y });
                    shortChanged = true;
                    i = Math.max(-1, i - 2);
                    continue;
                }
            }

            const firstHorizontal = Math.abs(a.y - b.y) < 1;
            const bridgeVertical = Math.abs(b.x - c.x) < 1;
            const secondHorizontal = Math.abs(c.y - d.y) < 1;
            if (firstHorizontal && bridgeVertical && secondHorizontal) {
                const bridgeLength = Math.abs(b.y - c.y);
                const sameDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
                if (canMoveWindowEnd && sameDirection && bridgeLength > 0.5 && bridgeLength < shortThreshold) {
                    finalPoints.splice(i + 1, 3, { x: d.x, y: a.y });
                    shortChanged = true;
                    i = Math.max(-1, i - 2);
                }
            }
        }
    }

    // [FIX-orthogonal] Short-segment elimination: remove S/Z-jog segments shorter than 2*cornerRadius.
    // When A* grid-snapping produces a tiny lateral offset (e.g. 9.75px), the resulting
    // micro-segment forces cornerRadius to compress (e.g. 8→4.875), visually creating
    // a diagonal "kink" instead of a clean orthogonal corner.
    // Strategy: scan for 3-point A→B→C where seg AB or BC is very short AND the
    // surrounding segments form an S-shape (same direction before and after the bridge).
    // Snap B to eliminate the jog, then re-collapse collinear points.
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < finalPoints.length - 1; i++) {
            const prev = finalPoints[i - 1];
            const curr = finalPoints[i];
            const next = finalPoints[i + 1];

            const segPrev = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
            const segNext = Math.abs(next.x - curr.x) + Math.abs(next.y - curr.y);

            // Check if current point creates a short bridge
            const shortSeg = Math.min(segPrev, segNext);
            if (shortSeg >= shortThreshold) continue;

            // Determine if this is an S-jog: prev-curr and curr-next are in the same axis
            const prevHoriz = Math.abs(prev.y - curr.y) < 1;
            const nextHoriz = Math.abs(curr.y - next.y) < 1;
            const prevVert = Math.abs(prev.x - curr.x) < 1;
            const nextVert = Math.abs(curr.x - next.x) < 1;

            // S-jog: H→V→H or V→H→V where the bridge (middle) segment is short
            if (prevVert && nextVert && segPrev < shortThreshold) {
                // Short horizontal bridge between two vertical segments
                // Snap curr.x and next.x to prev.x to straighten
                curr.x = prev.x;
                // If next is a corner, snap its x too
                if (i + 2 < finalPoints.length) {
                    // Only snap next if it keeps the path valid
                    const afterNext = finalPoints[i + 2];
                    if (Math.abs(afterNext.y - next.y) < 1) {
                        // afterNext→next is horizontal, safe to move next.x
                        next.x = prev.x;
                    }
                }
                shortChanged = true;
            } else if (prevHoriz && nextHoriz && segPrev < shortThreshold) {
                // Short vertical bridge between two horizontal segments
                curr.y = prev.y;
                if (i + 2 < finalPoints.length) {
                    const afterNext = finalPoints[i + 2];
                    if (Math.abs(afterNext.x - next.x) < 1) {
                        next.y = prev.y;
                    }
                }
                shortChanged = true;
            }
        }
    }
    // Re-collapse if we straightened any jogs
    const renderPoints = shortChanged
        ? collapseCollinearBacktracks(finalPoints)
        : finalPoints;

    if (renderPoints.length < 2) return '';

    // [FIX] Final strict orthogonality pass: any remaining diagonal segment
    // (both dx>1 AND dy>1) means an intermediate waypoint was lost upstream.
    // Insert an L-turn to restore proper right-angle routing.
    // Rule: dominant-axis-first — if mostly vertical (dy>dx), go horizontal first
    // (insert the x-target at current y), so the path arrives at the target vertically.
    // This is the "final defense" — createFilletedPath guarantees orthogonal SVG output.
    let diagFixed = false;
    const orthoList: Point[] = [renderPoints[0]];
    for (let i = 0; i < renderPoints.length - 1; i++) {
        const pa = renderPoints[i];
        const pb = renderPoints[i + 1];
        const ddx = Math.abs(pa.x - pb.x);
        const ddy = Math.abs(pa.y - pb.y);
        if (ddx > 1 && ddy > 1) {
            // Insert L-turn: dominant-axis first
            const lturn = ddy >= ddx
                ? { x: pb.x, y: pa.y }  // horizontal first → vertical approach to target
                : { x: pa.x, y: pb.y }; // vertical first   → horizontal approach to target
            orthoList.push(lturn);
            diagFixed = true;
        }
        orthoList.push({ x: pb.x, y: pb.y });
    }
    const finalRenderPoints = diagFixed
        ? collapseCollinearBacktracks(orthoList)
        : renderPoints;

    if (finalRenderPoints.length < 2) return '';

    if (cornerRadius <= 0) {
        return "M " + finalRenderPoints.map(p => `${p.x} ${p.y}`).join(" L ");
    }

    const minReadableStraightAfterFillet = Math.max(12, Math.min(18, cornerRadius * 2));
    // Terminal direction validation and the routing quality contract both
    // require 48px of visible straight run. A fillet may consume the surplus,
    // but must never shorten the rendered terminal stub below that contract.
    const minRenderedEndpointStub = 48;
    const readableRadiusCap = (length: number, minVisibleLength = minReadableStraightAfterFillet, singleFillet = false): number => {
        if (length <= minVisibleLength) return 0;
        return singleFillet
            ? length - minVisibleLength
            : (length - minVisibleLength) / 2;
    };

    let path = `M ${finalRenderPoints[0].x} ${finalRenderPoints[0].y}`;

    for (let i = 1; i < finalRenderPoints.length - 1; i++) {
        const pPrev = finalRenderPoints[i - 1];
        const pCurr = finalRenderPoints[i];
        const pNext = finalRenderPoints[i + 1];

        // 1. Calculate vectors
        const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
        const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };

        const l1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const l2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        // 2. Determine safe radius.
        // Keep neighboring fillets from consuming a short bridge into a zero-length rendered line.
        const previousIsEndpointStub = i === 1;
        const nextIsEndpointStub = i === finalRenderPoints.length - 2;
        const r = Math.min(
            cornerRadius,
            l1 / 3,
            l2 / 3,
            readableRadiusCap(l1, previousIsEndpointStub ? minRenderedEndpointStub : minReadableStraightAfterFillet, previousIsEndpointStub),
            readableRadiusCap(l2, nextIsEndpointStub ? minRenderedEndpointStub : minReadableStraightAfterFillet, nextIsEndpointStub),
        );

        if (r < 1.5) {
            path += ` L ${pCurr.x} ${pCurr.y}`;
            continue;
        }

        // 3. Identify Start/End of Curve
        // Start: Move back 'r' from pCurr along v1
        // End: Move forward 'r' from pCurr along v2

        // Normalize vectors handled implicitly by ratio
        const r1Ratio = (l1 > 0) ? (r / l1) : 0;
        const r2Ratio = (l2 > 0) ? (r / l2) : 0;

        const startCurve = {
            x: pCurr.x - v1.x * r1Ratio,
            y: pCurr.y - v1.y * r1Ratio
        };

        const endCurve = {
            x: pCurr.x + v2.x * r2Ratio,
            y: pCurr.y + v2.y * r2Ratio
        };

        // 4. Draw Line to Start of Curve
        path += ` L ${startCurve.x} ${startCurve.y}`;

        // 5. Draw Curve (Circular Arc instead of Quadratic Bezier)
        // Cross product to determine turn direction (clockwise vs counter-clockwise)
        const cross = v1.x * v2.y - v1.y * v2.x;
        // sweep-flag: 1 if positive cross product (clockwise turn), 0 otherwise
        const sweepFlag = cross > 0 ? 1 : 0;

        // For 90 degree corners (orthogonal routing), distance to corner `r` equals the circular radius.
        // For non-90, we compute the actual radius required for a tangent arc, though most are 90.
        // Using `r` as the distance to corner is standard. The actual circle radius R = r * tan(theta/2).
        // For orthogonal lines, R = r. To handle non-orthogonal gracefully without complex math,
        // we can still use Q for non-orthogonal, or just compute R.
        // Let's use the actual angle:
        const dot = v1.x * v2.x + v1.y * v2.y;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (l1 * l2))));
        // If angle is close to 0 or 180, it's straight, handled by skipping or small r.
        const actualRadius = r * Math.abs(Math.tan(angle / 2));

        // Ensure we don't have NaN or Infinite radius.
        // Minimum 2px to avoid visually imperceptible micro-arcs that add SVG complexity.
        const safeRadius = Math.max(2, Number.isFinite(actualRadius) ? actualRadius : r);

        // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
        path += ` A ${safeRadius} ${safeRadius} 0 0 ${sweepFlag} ${endCurve.x} ${endCurve.y}`;
    }

    // Final segment to last point
    const last = finalRenderPoints[finalRenderPoints.length - 1];
    path += ` L ${last.x} ${last.y}`;

    return path;

}

// [NEW] Offsets path segments by a fixed amount perpendicular to their direction
// Used for "Nudging" shared segments to separate them visualy.
export function offsetPathSegments(points: Point[], offset: number): Point[] {
    if (points.length < 2 || offset === 0) return points;

    const result: Point[] = [];
    // We offset the segments, which means we need to recalculate the intersection points (corners).
    // Simple approach for orthogonal paths:
    // If horizontal centered at Y, new Y = Y + offset.
    // If vertical centered at X, new X = X + offset.

    // BUT: The offset direction depends on the "flow" usually?
    // Or just absolute offset?
    // If we want to separate A and B, A gets +5, B gets -5.
    // Vertical: A's X += 5. Horizontal: A's Y += 5?
    // This works if we assume "Right/Down" is positive.

    // Corner handling:
    // p0(x, y) -> p1(x+100, y) -> p2(x+100, y+50)
    // Offset +5:
    // Seg1: y += 5.
    // Seg2: x += 5.
    // New Corner: (x+100+5, y+5)

    // Algorithm:
    // 1. Calculate offset line for each segment.
    // 2. Intersect adjacent offset lines to find new corner points.

    // For orthogonal paths, this is trivial.
    // p[i] is the start of segment i. p[i+1] is end.

    // We treat the points as defining a sequence of segments.
    // We shift each segment.
    // Then we reconnect them.

    const segments: { p1: Point, p2: Point, isHorz: boolean }[] = [];

    for (let i = 0; i < points.length - 1; i++) {
        segments.push({
            p1: points[i],
            p2: points[i + 1],
            isHorz: Math.abs(points[i].y - points[i + 1].y) < 1
        });
    }

    // Verify orthogonality (if not orthogonal, this simple logic fails, but we assume orthogonal from previous steps)

    // Shift segments
    const shiftedSegments = segments.map(seg => {
        if (seg.isHorz) {
            return {
                start: { x: seg.p1.x, y: seg.p1.y + offset },
                end: { x: seg.p2.x, y: seg.p2.y + offset },
                isHorz: true
            };
        } else {
            return {
                start: { x: seg.p1.x + offset, y: seg.p1.y },
                end: { x: seg.p2.x + offset, y: seg.p2.y },
                isHorz: false
            };
        }
    });

    // Rebuild points
    // First point
    result.push(shiftedSegments[0].start);

    for (let i = 0; i < shiftedSegments.length - 1; i++) {
        const curr = shiftedSegments[i];
        const next = shiftedSegments[i + 1];

        // Find intersection of curr and next
        // Since they are orthogonal and connected, the intersection is simply:
        // If curr is Horz, next is Vert: (next.x, curr.y)
        // If curr is Vert, next is Horz: (curr.x, next.y)

        // Wait, shifted lines intersection:
        // Curr (shifted): Y = Cy
        // Next (shifted): X = Nx
        // Intersection: (Nx, Cy)

        if (curr.isHorz && !next.isHorz) {
            result.push({ x: next.start.x, y: curr.start.y });
        } else if (!curr.isHorz && next.isHorz) {
            result.push({ x: curr.start.x, y: next.start.y });
        } else {
            // Parallel segments? (Should be collapsed by simplify, but if not...)
            // Just use the midpoint or continue
            result.push(curr.end);
        }
    }

    // Last point
    result.push(shiftedSegments[shiftedSegments.length - 1].end);

    return result;
}
