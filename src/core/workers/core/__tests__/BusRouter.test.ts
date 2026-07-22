import { describe, it, expect, vi } from 'vitest';
import {
    resolveBusOrientation,
    getEdgeQuadrant,
    filterPeersByQuadrant,
    sortEdgesByLane,
    calculateBusSeparation
} from '../BusRouter';
import { EdgeConstraint } from '../../../types/routing';
import * as gc from '../../../algorithms/geometry-classifier';

describe('BusRouter', () => {
    // Mock Nodes and Edges
    const mockNodes = [
        { id: 'hub', x: 100, y: 100, position: { x: 100, y: 100 }, width: 80, height: 60 },
        { id: 'peerR', x: 300, y: 100, position: { x: 300, y: 100 }, width: 40, height: 40 }, // dx = 180, dy = 0 -> horizontal-right
        { id: 'peerL', x: -100, y: 100, position: { x: -100, y: 100 }, width: 40, height: 40 }, // dx = -180, dy = 0 -> horizontal-left
        { id: 'peerB', x: 120, y: 300, position: { x: 120, y: 300 }, width: 40, height: 40 }, // dx = 20, dy = 190 -> vertical-down
        { id: 'peerT', x: 120, y: -100, position: { x: 120, y: -100 }, width: 40, height: 40 }, // dx = 20, dy = -190 -> vertical-up
        { id: 'peerDiag', x: 250, y: 220, position: { x: 250, y: 220 }, width: 40, height: 40 } // dx = 130, dy = 110
    ];

    const mockEdges = [
        { id: 'e1', source: 'hub', target: 'peerR' },
        { id: 'e2', source: 'hub', target: 'peerL' },
        { id: 'e3', source: 'hub', target: 'peerB' },
        { id: 'e4', source: 'hub', target: 'peerT' },
        { id: 'e5', source: 'hub', target: 'peerDiag' }
    ];

    describe('resolveBusOrientation', () => {
        it('should fallback to global direction if hub node is not found', () => {
            const result = resolveBusOrientation(false, 'unknown', mockEdges, mockNodes, 'TB');
            expect(result).toEqual({ busDir: 'TB', isHorz: false });
        });

        it('should resolve to LR (horizontal) if horizontal votes dominate', () => {
            const edges = [
                { id: 'e1', source: 'hub', target: 'peerR' },
                { id: 'e2', source: 'hub', target: 'peerL' }
            ];
            const result = resolveBusOrientation(false, 'hub', edges, mockNodes, 'TB');
            expect(result).toEqual({ busDir: 'LR', isHorz: true });
        });

        it('should resolve to TB (vertical) if vertical votes dominate', () => {
            const edges = [
                { id: 'e3', source: 'hub', target: 'peerB' },
                { id: 'e4', source: 'hub', target: 'peerT' }
            ];
            const result = resolveBusOrientation(false, 'hub', edges, mockNodes, 'LR');
            expect(result).toEqual({ busDir: 'TB', isHorz: false });
        });

        it('should handle diagonal weak votes based on aspect ratio', () => {
            const spy = vi.spyOn(gc, 'analyzeGeometry');

            const nodes = [
                { id: 'hub', x: 0, y: 0, position: { x: 0, y: 0 }, width: 10, height: 10 },
                { id: 'diagH', x: 100, y: 50, position: { x: 100, y: 50 }, width: 10, height: 10 }, // dx=100, dy=50
                { id: 'diagV', x: 50, y: 100, position: { x: 50, y: 100 }, width: 10, height: 10 }  // dx=50, dy=100
            ];

            // Test dx > dy * 1.2 branch in BusRouter
            spy.mockReturnValue('diagonal-se');
            const edgesH = [{ id: 'e1', source: 'hub', target: 'diagH' }];
            const resH = resolveBusOrientation(false, 'hub', edgesH, nodes, 'TB');
            expect(resH.busDir).toBe('LR');

            // Test dy > dx * 1.2 branch in BusRouter
            spy.mockReturnValue('diagonal-ne');
            const edgesV = [{ id: 'e2', source: 'hub', target: 'diagV' }];
            const resV = resolveBusOrientation(false, 'hub', edgesV, nodes, 'LR');
            expect(resV.busDir).toBe('TB');

            spy.mockRestore();
        });

        it('should fallback to globalDir on tie', () => {
            const edges = [
                { id: 'e1', source: 'hub', target: 'peerR' },
                { id: 'e3', source: 'hub', target: 'peerB' }
            ];
            const result = resolveBusOrientation(false, 'hub', edges, mockNodes, 'RL');
            expect(result).toEqual({ busDir: 'RL', isHorz: true });
        });

        it('should handle isTarget = true correctly', () => {
            const incomingEdges = [
                { id: 'e1', source: 'peerR', target: 'hub' }
            ];
            const result = resolveBusOrientation(true, 'hub', incomingEdges, mockNodes, 'TB');
            expect(result.busDir).toBe('LR');
        });
    });

    describe('getEdgeQuadrant', () => {
        it('should return -1 if edge is not found', () => {
            expect(getEdgeQuadrant('unknown', 'hub', true, mockEdges, mockNodes)).toBe(-1);
        });

        it('should return -1 if origin or other node is not found', () => {
            expect(getEdgeQuadrant('e1', 'unknown', true, mockEdges, mockNodes)).toBe(-1);
        });

        it('should return correct quadrant based on vector geometry', () => {
            expect(getEdgeQuadrant('e1', 'hub', true, mockEdges, mockNodes)).toBe(0);
            expect(getEdgeQuadrant('e2', 'hub', true, mockEdges, mockNodes)).toBe(2);
            expect(getEdgeQuadrant('e3', 'hub', true, mockEdges, mockNodes)).toBe(1);
            expect(getEdgeQuadrant('e4', 'hub', true, mockEdges, mockNodes)).toBe(3);
        });
    });

    describe('filterPeersByQuadrant', () => {
        it('should return peerList as-is if targetQuad is -1', () => {
            expect(filterPeersByQuadrant(mockEdges, 'hub', true, -1, mockEdges, mockNodes)).toEqual(mockEdges);
        });

        it('should filter out edges if origin or other node is missing', () => {
            const badEdges = [{ id: 'bad', source: 'hub', target: 'missing' }];
            const result = filterPeersByQuadrant(badEdges, 'hub', true, 0, badEdges, mockNodes);
            expect(result.length).toBe(0);
        });

        describe('hemisphere check (refDx/refDy provided)', () => {
            it('should filter by right/left hemisphere for horizontal layouts', () => {
                const rightResult = filterPeersByQuadrant(mockEdges, 'hub', true, 0, mockEdges, mockNodes, 'LR', 10, 0);
                expect(rightResult.map(e => e.id)).toContain('e1');
                expect(rightResult.map(e => e.id)).not.toContain('e2');

                const leftResult = filterPeersByQuadrant(mockEdges, 'hub', true, 0, mockEdges, mockNodes, 'LR', -10, 0);
                expect(leftResult.map(e => e.id)).toContain('e2');
                expect(leftResult.map(e => e.id)).not.toContain('e1');
            });

            it('should filter by bottom/top hemisphere for vertical layouts', () => {
                const bottomResult = filterPeersByQuadrant(mockEdges, 'hub', true, 0, mockEdges, mockNodes, 'TB', 0, 10);
                expect(bottomResult.map(e => e.id)).toContain('e3');
                expect(bottomResult.map(e => e.id)).not.toContain('e4');

                const topResult = filterPeersByQuadrant(mockEdges, 'hub', true, 0, mockEdges, mockNodes, 'TB', 0, -10);
                expect(topResult.map(e => e.id)).toContain('e4');
                expect(topResult.map(e => e.id)).not.toContain('e3');
            });
        });

        describe('fallback quadrant check (refDx=0, refDy=0)', () => {
            it('should filter for horizontal layouts based on targetQuad', () => {
                // targetQuad = 1, layout = LR -> should trigger right-ish (dx > 0)
                const rightResult = filterPeersByQuadrant(mockEdges, 'hub', true, 1, mockEdges, mockNodes, 'LR', 0, 0);
                expect(rightResult.map(e => e.id)).toContain('e1');
                expect(rightResult.map(e => e.id)).not.toContain('e2');

                const leftResult = filterPeersByQuadrant(mockEdges, 'hub', true, 2, mockEdges, mockNodes, 'LR', 0, 0);
                expect(leftResult.map(e => e.id)).toContain('e2');
                expect(leftResult.map(e => e.id)).not.toContain('e1');
            });

            it('should filter for vertical layouts based on targetQuad', () => {
                const bottomResult = filterPeersByQuadrant(mockEdges, 'hub', true, 1, mockEdges, mockNodes, 'TB', 0, 0);
                expect(bottomResult.map(e => e.id)).toContain('e3');

                const topResult = filterPeersByQuadrant(mockEdges, 'hub', true, 3, mockEdges, mockNodes, 'TB', 0, 0);
                expect(topResult.map(e => e.id)).toContain('e4');
            });

            it('should fallback to strict quadrant match for other layoutDirections', () => {
                // FREE layout -> targetQuad = 0 (Right) -> should match e1 and e5
                const result = filterPeersByQuadrant(mockEdges, 'hub', true, 0, mockEdges, mockNodes, 'FREE', 0, 0);
                expect(result.map(e => e.id)).toEqual(['e1', 'e5']);
            });
        });
    });

    describe('sortEdgesByLane', () => {
        const edgeList = [
            { id: 'e1', source: 'hub', target: 'peerR' }, // dx = 200 (dy = 0)
            { id: 'e3', source: 'hub', target: 'peerB' }  // dy = 200 (dx = 20)
        ];

        it('should return 0 signed distance if selfNode or otherNode is missing', () => {
            const badEdges = [{ id: 'bad', source: 'hub', target: 'missing' }];
            const sorted = sortEdgesByLane(badEdges, true, 'hub', 'missing', mockNodes, 'LR');
            expect(sorted).toEqual(badEdges);
        });

        it('should sort logically in horizontal spine flow (busDir = TB, using dx)', () => {
            // busDir = 'TB' -> isHorzFlow = false -> sorting by dx
            // dist(e1) = 300 - 100 = 200
            // dist(e3) = 120 - 100 = 20
            // sorted downstream should be e3 (20), then e1 (200)
            const sorted = sortEdgesByLane(edgeList, true, 'hub', 'target', mockNodes, 'TB');
            expect(sorted.map(e => e.id)).toEqual(['e3', 'e1']);
        });

        it('should sort logically in vertical spine flow (busDir = LR, using dy)', () => {
            // busDir = 'LR' -> isHorzFlow = true -> sorting by dy
            // dist(e1) = 100 - 100 = 0 (downstream)
            // dist(e3) = 300 - 100 = 200 (downstream)
            // sorted downstream: e1 (0), then e3 (200)
            const sorted = sortEdgesByLane(edgeList, true, 'hub', 'target', mockNodes, 'LR');
            expect(sorted.map(e => e.id)).toEqual(['e1', 'e3']);
        });

        it('should apply constraintsMap priority sorting (lower priority is inner/earlier)', () => {
            const constraints: Record<string, EdgeConstraint> = {
                e1: { routingType: 'bus', obstacleBehavior: 'strict', priority: 2 },
                e3: { routingType: 'bus', obstacleBehavior: 'strict', priority: 1 }
            };
            const sorted = sortEdgesByLane(edgeList, true, 'hub', 'target', mockNodes, 'LR', constraints);
            expect(sorted.map(e => e.id)).toEqual(['e3', 'e1']);
        });
    });

    describe('calculateBusSeparation', () => {
        const nodeRect = { x: 0, y: 0, width: 200, height: 100 };

        it('should return DEFAULT_SEPARATION if nodeRect is null or branchCount <= 1', () => {
            expect(calculateBusSeparation(null, 5, true)).toBe(40);
            expect(calculateBusSeparation(nodeRect, 1, true)).toBe(40);
            expect(calculateBusSeparation(nodeRect, 0, true)).toBe(40);
        });

        it('should calculate adaptive spacing for horizontal spine using width', () => {
            expect(calculateBusSeparation(nodeRect, 3, true)).toBe(40);
            expect(calculateBusSeparation(nodeRect, 8, true)).toBe(20);
        });

        it('should calculate adaptive spacing for vertical spine using height', () => {
            expect(calculateBusSeparation(nodeRect, 3, false)).toBe(20);
        });

        it('should clamp calculated separation between MIN and MAX limits', () => {
            expect(calculateBusSeparation({ x: 0, y: 0, width: 1000, height: 100 }, 2, true)).toBe(80);
            expect(calculateBusSeparation({ x: 0, y: 0, width: 10, height: 100 }, 3, true)).toBe(20);
        });
    });
});
