import { describe, it, expect } from 'vitest';
import { geometryAnalyzer } from '../GeometryAnalyzer';
import { NodeGeometry, Point } from '../../types/routing';

describe('GeometryAnalyzer', () => {
    const sNode: NodeGeometry = {
        id: 'source',
        position: { x: 10, y: 10 },
        dimensions: { width: 100, height: 50 }
    };
    const tNode: NodeGeometry = {
        id: 'target',
        position: { x: 200, y: 200 },
        dimensions: { width: 80, height: 60 }
    };

    describe('getCenter', () => {
        it('should calculate the center point correctly', () => {
            const center = geometryAnalyzer.getCenter(sNode);
            // x = 10 + 100 / 2 = 60
            // y = 10 + 50 / 2 = 35
            expect(center).toEqual({ x: 60, y: 35 });
        });

        it('should handle fallback default dimensions and position', () => {
            const node: any = {};
            const center = geometryAnalyzer.getCenter(node);
            expect(center).toEqual({ x: 0, y: 0 });
        });
    });

    describe('getHandleAnchor', () => {
        it('should compute left handle anchor', () => {
            const anchor = geometryAnalyzer.getHandleAnchor(sNode, 'l');
            expect(anchor).toEqual({ x: 10, y: 35 });
        });

        it('should compute right handle anchor with offset', () => {
            const anchor = geometryAnalyzer.getHandleAnchor(sNode, 'r2');
            // x = 10 + 100 = 110
            // y = 10 + 25 = 35 + 2 * 10 (spacing) = 55
            expect(anchor).toEqual({ x: 110, y: 55 });
        });

        it('should compute top handle anchor with offset', () => {
            const anchor = geometryAnalyzer.getHandleAnchor(sNode, 't1');
            // x = 10 + 50 = 60 + 1 * 10 = 70
            // y = 10
            expect(anchor).toEqual({ x: 70, y: 10 });
        });

        it('should compute bottom handle anchor', () => {
            const anchor = geometryAnalyzer.getHandleAnchor(sNode, 'b');
            expect(anchor).toEqual({ x: 60, y: 60 });
        });

        it('should fallback to center when side is unknown', () => {
            const anchor = geometryAnalyzer.getHandleAnchor(sNode, 'z');
            expect(anchor).toEqual({ x: 60, y: 35 });
        });
    });

    describe('analyze', () => {
        it('should calculate distance, angle and relative vectors', () => {
            const analysis = geometryAnalyzer.analyze(sNode, tNode, 'LR');
            // sCenter = (60, 35)
            // tCenter = (240, 230)
            // dx = 180, dy = 195
            expect(analysis.dx).toBe(180);
            expect(analysis.dy).toBe(195);
            expect(analysis.distance).toBeCloseTo(Math.sqrt(180**2 + 195**2), 2);
            expect(analysis.isBackwards).toBe(false);
        });

        it('should detect dominant axes correctly', () => {
            // 水平主导
            const nodeR: NodeGeometry = {
                id: 'right',
                position: { x: 300, y: 10 },
                dimensions: { width: 100, height: 50 }
            };
            const analysisH = geometryAnalyzer.analyze(sNode, nodeR, 'LR');
            expect(analysisH.isHorizontalDominant).toBe(true);
            expect(analysisH.isVerticalDominant).toBe(false);

            // 垂直主导
            const nodeB: NodeGeometry = {
                id: 'bottom',
                position: { x: 10, y: 300 },
                dimensions: { width: 100, height: 50 }
            };
            const analysisV = geometryAnalyzer.analyze(sNode, nodeB, 'LR');
            expect(analysisV.isHorizontalDominant).toBe(false);
            expect(analysisV.isVerticalDominant).toBe(true);
        });
    });

    describe('analyzeAlignment', () => {
        it('should detect horizontal alignment within threshold', () => {
            const alignedNode: NodeGeometry = {
                id: 'aligned',
                position: { x: 200, y: 12 }, // sCenter y=35, alignedCenter y=37 (diff = 2 < 10)
                dimensions: { width: 100, height: 50 }
            };
            const alignment = geometryAnalyzer.analyzeAlignment(sNode, alignedNode, 10);
            expect(alignment.isAligned).toBe(true);
            expect(alignment.alignAxis).toBe('horizontal');
            expect(alignment.offset).toBe(2);
        });

        it('should detect vertical alignment within threshold', () => {
            const alignedNode: NodeGeometry = {
                id: 'aligned',
                position: { x: 12, y: 300 }, // sCenter x=60, alignedCenter x=62 (diff = 2 < 10)
                dimensions: { width: 100, height: 50 }
            };
            const alignment = geometryAnalyzer.analyzeAlignment(sNode, alignedNode, 10);
            expect(alignment.isAligned).toBe(true);
            expect(alignment.alignAxis).toBe('vertical');
            expect(alignment.offset).toBe(2);
        });

        it('should return isAligned = false when not aligned', () => {
            const alignment = geometryAnalyzer.analyzeAlignment(sNode, tNode, 10);
            expect(alignment.isAligned).toBe(false);
            expect(alignment.alignAxis).toBe('none');
        });
    });

    describe('isPointInRect', () => {
        const rect = { x: 10, y: 10, width: 20, height: 20 };

        it('should return true for points inside the rect', () => {
            expect(geometryAnalyzer.isPointInRect({ x: 15, y: 15 }, rect)).toBe(true);
        });

        it('should return false for points outside the rect', () => {
            expect(geometryAnalyzer.isPointInRect({ x: 5, y: 5 }, rect)).toBe(false);
        });
    });

    describe('distance helpers', () => {
        it('should calculate euclidean and manhattan distance correctly', () => {
            const p1: Point = { x: 0, y: 0 };
            const p2: Point = { x: 3, y: 4 };
            expect(geometryAnalyzer.distance(p1, p2)).toBe(5);
            expect(geometryAnalyzer.manhattanDistance(p1, p2)).toBe(7);
        });
    });
});
