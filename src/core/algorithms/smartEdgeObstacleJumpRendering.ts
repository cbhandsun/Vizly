import type { Point } from './pathfinding';
import { getIntersection } from './smartEdgeGeometryCore';


// [NEW] Optimized Path with Jumps using Line Obstacles
// Replaces createRoundedPathWithJumps with a version that uses pre-computed line obstacles
// instead of re-calculating other paths.
export function createPathWithJumpsFromObstacles(
    points: Point[],
    borderRadius: number,
    jumpRadius: number,
    lineObstacles: { start: Point, end: Point }[]
): string {
    if (!points || points.length < 2) return '';

    // De-dupe
    const cleanPoints: Point[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const last = cleanPoints[cleanPoints.length - 1];
        const curr = points[i];
        if (Math.abs(last.x - curr.x) > 0.1 || Math.abs(last.y - curr.y) > 0.1) {
            cleanPoints.push(curr);
        }
    }
    points = cleanPoints;
    if (points.length < 2) return '';

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        // Corner Radius Logic
        let startRatio = 0;
        if (i > 1) startRatio = Math.min(borderRadius, len / 2) / len;

        let endRatio = 0;
        if (i < points.length - 1) endRatio = Math.min(borderRadius, len / 2) / len;

        if (startRatio + endRatio > 1) {
            startRatio = 0.5;
            endRatio = 0.5;
        }

        const isFirstSegment = i === 1;
        const isLastSegment = i === points.length - 1;

        const drawStart = isFirstSegment ? { x: prev.x, y: prev.y } : {
            x: prev.x + dx * startRatio,
            y: prev.y + dy * startRatio
        };

        const drawEnd = isLastSegment ? { x: curr.x, y: curr.y } : {
            x: curr.x - dx * endRatio,
            y: curr.y - dy * endRatio
        };

        // Detect Jumps
        // Check intersection of (drawStart -> drawEnd) with all lineObstacles
        const jumps: Point[] = [];
        const isSegHoriz = Math.abs(drawStart.y - drawEnd.y) < 0.1;
        const isSegVert = Math.abs(drawStart.x - drawEnd.x) < 0.1;

        for (const obs of lineObstacles) {
            // Skip tiny obstacles or self? (Caller must ensure lineObstacles doesn't contain self)
            // Intersect strict (drawStart, drawEnd) with (obs.start, obs.end)
            const intersection = getIntersection(drawStart, drawEnd, obs.start, obs.end);
            if (intersection) {
                // Determine if 'obs' is perpendicular to us (we only jump perpendicular lines usually)
                const obsDx = obs.end.x - obs.start.x;
                const obsDy = obs.end.y - obs.start.y;
                const isObsHoriz = Math.abs(obsDy) < 0.1;
                const isObsVert = Math.abs(obsDx) < 0.1;

                if ((isSegHoriz && isObsVert) || (isSegVert && isObsHoriz)) {
                    jumps.push(intersection);
                }
            }
        }

        // Sort jumps along the segment
        jumps.sort((a, b) => {
            if (isSegHoriz) {
                return drawEnd.x > drawStart.x ? (a.x - b.x) : (b.x - a.x);
            } else {
                return drawEnd.y > drawStart.y ? (a.y - b.y) : (b.y - a.y);
            }
        });

        // Filter duplicate jumps (close proximity)
        const uniqueJumps: Point[] = [];
        if (jumps.length > 0) {
            uniqueJumps.push(jumps[0]);
            for (let k = 1; k < jumps.length; k++) {
                const lastJ = uniqueJumps[uniqueJumps.length - 1];
                const currJ = jumps[k];
                const dist = Math.sqrt(Math.pow(currJ.x - lastJ.x, 2) + Math.pow(currJ.y - lastJ.y, 2));
                if (dist > jumpRadius * 2) { // Ensure clear separation
                    uniqueJumps.push(currJ);
                }
            }
        }

        // Draw Segment with Jumps
        // const currentPos = { x: drawStart.x, y: drawStart.y };

        for (const jump of uniqueJumps) {
            const jr = jumpRadius;

            // Distance validation
            // let distToJump = 0;
            // let segmentLen = 0;
            // if (isSegHoriz) {
            //    distToJump = Math.abs(jump.x - currentPos.x); // Distance from CURRENT pos
            //    segmentLen = Math.abs(drawEnd.x - currentPos.x);
            // } else {
            //    distToJump = Math.abs(jump.y - currentPos.y);
            //    segmentLen = Math.abs(drawEnd.y - currentPos.y);
            // }

            // If jump is right at start, or too close for arc?
            // Actually we just draw!

            // Calculate Arc Start
            let arcStart: Point;
            let arcEnd: Point;
            let control: Point;

            if (isSegHoriz) {
                const sign = (drawEnd.x > drawStart.x) ? 1 : -1;
                arcStart = { x: jump.x - jr * sign, y: jump.y };
                arcEnd = { x: jump.x + jr * sign, y: jump.y };
                control = { x: jump.x, y: jump.y - jr * 1.5 }; // Up/Down? Default Up (-y)
                // If we want consistency, maybe always -y?
                // Or direction dependent? Drawing 'Up' bridge usually means negative Y offset.
            } else {
                const sign = (drawEnd.y > drawStart.y) ? 1 : -1;
                arcStart = { x: jump.x, y: jump.y - jr * sign };
                arcEnd = { x: jump.x, y: jump.y + jr * sign };
                control = { x: jump.x - jr * 1.5, y: jump.y }; // Left/Right? Default Left (-x)
            }

            path += ` L ${arcStart.x} ${arcStart.y}`;
            path += ` Q ${control.x} ${control.y} ${arcEnd.x} ${arcEnd.y}`;
        }

        path += ` L ${drawEnd.x} ${drawEnd.y}`;

        // Draw Corner to next segment
        if (i < points.length - 1) {
            const next = points[i + 1];
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            const radius = Math.min(borderRadius, len / 2, len2 / 2);

            const arcEndRatio = (len2 > 0) ? (radius / len2) : 0;
            const arcEndCor = {
                x: curr.x + dx2 * arcEndRatio,
                y: curr.y + dy2 * arcEndRatio
            };

            path += ` Q ${curr.x} ${curr.y} ${arcEndCor.x} ${arcEndCor.y}`;
        }
    }

    return path;
}
