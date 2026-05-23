import { describe, it, expect } from 'vitest';
import {
    distance,
    manhattanDistance,
    pointInRect,
    pointStrictlyInRect,
    lineSegmentsIntersect,
    lineIntersectsRect,
    getRectCorners,
    getExpandedRectCorners,
    rectIntersects,
    pointToSegmentDistance,
    Point,
    Rectangle,
    LineSegment
} from '../geometryUtils';

describe('geometryUtils', () => {
    describe('distance', () => {
        it('should calculate Euclidean distance correctly', () => {
            const p1: Point = { x: 0, y: 0 };
            const p2: Point = { x: 3, y: 4 };
            expect(distance(p1, p2)).toBe(5);

            const p3: Point = { x: 1, y: 1 };
            const p4: Point = { x: 1, y: 1 };
            expect(distance(p3, p4)).toBe(0);

            const p5: Point = { x: -1, y: -2 };
            const p6: Point = { x: 2, y: 2 };
            expect(distance(p5, p6)).toBe(5);
        });
    });

    describe('manhattanDistance', () => {
        it('should calculate Manhattan distance correctly', () => {
            const p1: Point = { x: 0, y: 0 };
            const p2: Point = { x: 3, y: 4 };
            expect(manhattanDistance(p1, p2)).toBe(7);

            const p3: Point = { x: 1, y: 1 };
            const p4: Point = { x: -1, y: -1 };
            expect(manhattanDistance(p3, p4)).toBe(4);
        });
    });

    describe('pointInRect', () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };

        it('should return true for points inside the rectangle', () => {
            expect(pointInRect({ x: 15, y: 15 }, rect)).toBe(true);
        });

        it('should return true for points on the boundaries', () => {
            expect(pointInRect({ x: 10, y: 10 }, rect)).toBe(true); // 左上
            expect(pointInRect({ x: 30, y: 30 }, rect)).toBe(true); // 右下
            expect(pointInRect({ x: 20, y: 10 }, rect)).toBe(true); // 上边
        });

        it('should return false for points outside the rectangle', () => {
            expect(pointInRect({ x: 5, y: 5 }, rect)).toBe(false);
            expect(pointInRect({ x: 35, y: 15 }, rect)).toBe(false);
        });

        it('should handle padding correctly', () => {
            expect(pointInRect({ x: 5, y: 15 }, rect, 0)).toBe(false);
            expect(pointInRect({ x: 5, y: 15 }, rect, 5)).toBe(true); // padding 5 包含 x=5
            expect(pointInRect({ x: 4, y: 15 }, rect, 5)).toBe(false);
        });
    });

    describe('pointStrictlyInRect', () => {
        const rect: Rectangle = { x: 10, y: 10, width: 20, height: 20 };

        it('should return true for points strictly inside the rectangle', () => {
            expect(pointStrictlyInRect({ x: 15, y: 15 }, rect)).toBe(true);
        });

        it('should return false for points on the boundaries', () => {
            expect(pointStrictlyInRect({ x: 10, y: 15 }, rect)).toBe(false);
            expect(pointStrictlyInRect({ x: 30, y: 15 }, rect)).toBe(false);
            expect(pointStrictlyInRect({ x: 15, y: 10 }, rect)).toBe(false);
            expect(pointStrictlyInRect({ x: 15, y: 30 }, rect)).toBe(false);
        });

        it('should return false for points outside the rectangle', () => {
            expect(pointStrictlyInRect({ x: 5, y: 5 }, rect)).toBe(false);
        });
    });

    describe('lineSegmentsIntersect', () => {
        it('should detect normal intersection', () => {
            const seg1: LineSegment = { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } };
            const seg2: LineSegment = { start: { x: 0, y: 10 }, end: { x: 10, y: 0 } };
            expect(lineSegmentsIntersect(seg1, seg2)).toBe(true);
            expect(lineSegmentsIntersect(seg1, seg2, false)).toBe(true);
        });

        it('should detect normal non-intersection', () => {
            const seg1: LineSegment = { start: { x: 0, y: 0 }, end: { x: 5, y: 5 } };
            const seg2: LineSegment = { start: { x: 6, y: 6 }, end: { x: 10, y: 10 } };
            expect(lineSegmentsIntersect(seg1, seg2)).toBe(false);
        });

        it('should handle endpoint intersections based on includeEndpoints flag', () => {
            const seg1: LineSegment = { start: { x: 0, y: 0 }, end: { x: 5, y: 5 } };
            const seg2: LineSegment = { start: { x: 5, y: 5 }, end: { x: 10, y: 5 } };

            expect(lineSegmentsIntersect(seg1, seg2, true)).toBe(true);
            expect(lineSegmentsIntersect(seg1, seg2, false)).toBe(false);
        });

        it('should handle collinear overlapping segments', () => {
            const seg1: LineSegment = { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } };
            const seg2: LineSegment = { start: { x: 5, y: 5 }, end: { x: 15, y: 15 } };

            expect(lineSegmentsIntersect(seg1, seg2, true)).toBe(true);
            expect(lineSegmentsIntersect(seg1, seg2, false)).toBe(false);
        });

        it('should return false for parallel non-overlapping segments', () => {
            const seg1: LineSegment = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
            const seg2: LineSegment = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };

            expect(lineSegmentsIntersect(seg1, seg2)).toBe(false);
        });
    });

    describe('lineIntersectsRect', () => {
        const rect: Rectangle = { x: 10, y: 10, width: 10, height: 10 };

        it('should return true if segment is entirely inside the rectangle', () => {
            const seg: LineSegment = { start: { x: 12, y: 12 }, end: { x: 18, y: 18 } };
            expect(lineIntersectsRect(seg, rect)).toBe(true);
            expect(lineIntersectsRect(seg, rect, true)).toBe(true);
        });

        it('should return true if segment cuts across the rectangle', () => {
            const seg: LineSegment = { start: { x: 5, y: 15 }, end: { x: 25, y: 15 } };
            expect(lineIntersectsRect(seg, rect)).toBe(true);
            expect(lineIntersectsRect(seg, rect, true)).toBe(true);
        });

        it('should return true if one endpoint is inside and one is outside', () => {
            const seg: LineSegment = { start: { x: 15, y: 15 }, end: { x: 25, y: 15 } };
            expect(lineIntersectsRect(seg, rect)).toBe(true);
        });

        it('should return false if segment is entirely outside and does not intersect', () => {
            const seg: LineSegment = { start: { x: 0, y: 0 }, end: { x: 5, y: 5 } };
            expect(lineIntersectsRect(seg, rect)).toBe(false);
        });

        it('should respect allowEdgeTouch for segment touching/lying on the border', () => {
            // 线段在 x=10 边界上
            const segOnEdge: LineSegment = { start: { x: 10, y: 5 }, end: { x: 10, y: 25 } };
            expect(lineIntersectsRect(segOnEdge, rect, false)).toBe(false);
            expect(lineIntersectsRect(segOnEdge, rect, true)).toBe(true);
        });

        it('should return true for segment touching the corner when allowEdgeTouch is true', () => {
            // 线段仅触碰左上角 (10, 10)
            const segTouchCorner: LineSegment = { start: { x: 5, y: 15 }, end: { x: 10, y: 10 } };
            expect(lineIntersectsRect(segTouchCorner, rect, true)).toBe(true);
        });
    });

    describe('getRectCorners', () => {
        it('should return four corners of the rectangle in correct order', () => {
            const rect: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
            const corners = getRectCorners(rect);

            expect(corners).toHaveLength(4);
            expect(corners[0]).toEqual({ x: 10, y: 20 }); // 左上
            expect(corners[1]).toEqual({ x: 40, y: 20 }); // 右上
            expect(corners[2]).toEqual({ x: 40, y: 60 }); // 右下
            expect(corners[3]).toEqual({ x: 10, y: 60 }); // 左下
        });
    });

    describe('getExpandedRectCorners', () => {
        it('should return expanded corner points including edge midpoints', () => {
            const rect: Rectangle = { x: 10, y: 20, width: 30, height: 40 };
            const offset = 2;
            const expanded = getExpandedRectCorners(rect, offset);

            expect(expanded).toHaveLength(8);
            // 原始 4 角
            expect(expanded[0]).toEqual({ x: 10, y: 20 });
            expect(expanded[1]).toEqual({ x: 40, y: 20 });
            expect(expanded[2]).toEqual({ x: 40, y: 60 });
            expect(expanded[3]).toEqual({ x: 10, y: 60 });
            // 扩展中点 (上中，右中，下中，左中)
            expect(expanded[4]).toEqual({ x: 25, y: 18 }); // 上中 (10 + 15, 20 - 2)
            expect(expanded[5]).toEqual({ x: 42, y: 40 }); // 右中 (40 + 2, 20 + 20)
            expect(expanded[6]).toEqual({ x: 25, y: 62 }); // 下中 (10 + 15, 60 + 2)
            expect(expanded[7]).toEqual({ x: 8, y: 40 });  // 左中 (10 - 2, 20 + 20)
        });
    });

    describe('rectIntersects', () => {
        const rect1: Rectangle = { x: 10, y: 10, width: 10, height: 10 };

        it('should return true for overlapping rectangles', () => {
            const rect2: Rectangle = { x: 15, y: 15, width: 10, height: 10 };
            expect(rectIntersects(rect1, rect2)).toBe(true);
        });

        it('should return true for touching rectangles (sharing an edge)', () => {
            const rect2: Rectangle = { x: 20, y: 10, width: 10, height: 10 };
            expect(rectIntersects(rect1, rect2)).toBe(true);
        });

        it('should return false for completely separated rectangles', () => {
            const rect2: Rectangle = { x: 30, y: 30, width: 10, height: 10 };
            expect(rectIntersects(rect1, rect2)).toBe(false);
        });
    });

    describe('pointToSegmentDistance', () => {
        it('should calculate perpendicular distance when projection is on segment', () => {
            const seg: LineSegment = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
            const p: Point = { x: 5, y: 5 };
            expect(pointToSegmentDistance(p, seg)).toBe(5);
        });

        it('should calculate distance to start point when projection is outside start', () => {
            const seg: LineSegment = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
            const p: Point = { x: -3, y: 4 }; // 最短到 (0,0) 的距离应该是 5
            expect(pointToSegmentDistance(p, seg)).toBe(5);
        });

        it('should calculate distance to end point when projection is outside end', () => {
            const seg: LineSegment = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
            const p: Point = { x: 13, y: 4 }; // 最短到 (10,0) 的距离应该是 5
            expect(pointToSegmentDistance(p, seg)).toBe(5);
        });

        it('should handle degenerated segment (point-like segment)', () => {
            const seg: LineSegment = { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
            const p: Point = { x: 3, y: 4 };
            expect(pointToSegmentDistance(p, seg)).toBe(5);
        });
    });
});
