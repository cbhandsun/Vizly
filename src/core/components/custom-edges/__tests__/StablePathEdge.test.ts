import { describe, expect, it } from 'vitest';

import type { Edge } from '@xyflow/react';

import { estimateEdgeLabelRect, getEdgeLabelAutoOffset } from '../edgeLabelAvoidance';
import { collectStablePathPeerPaths } from '../stablePathEdgePeerPaths';

describe('edge label avoidance', () => {
    it.each([false, true])('fits into a vertical gap without changing the input geometry (mirrored=%s)', mirrored => {
        const sign = mirrored ? -1 : 1;
        const path = [{ x: 0, y: 16 * sign }, { x: 0, y: 0 }];
        const center = { x: 0, y: 8 * sign };
        const obstacles = [
            { x: -100, y: mirrored ? 0 : -200, width: 200, height: 200 },
            { x: -100, y: mirrored ? -270 : 70, width: 200, height: 200 },
        ];
        const original = structuredClone({ path, center, obstacles });
        const scale = 0.72 / 0.4199312039312039;
        const offset = getEdgeLabelAutoOffset(path, center, 'Flow', [], obstacles, scale);
        const labelRect = estimateEdgeLabelRect({ x: offset.x, y: center.y + offset.y }, 'Flow', scale);
        for (const obstacle of obstacles) {
            expect(labelRect.y + labelRect.height <= obstacle.y || labelRect.y >= obstacle.y + obstacle.height).toBe(true);
        }
        expect({ path, center, obstacles }).toEqual(original);
        expect(getEdgeLabelAutoOffset(path, center, 'Flow', [], obstacles, scale)).toEqual(offset);
        expect(Math.abs(offset.y)).toBeLessThanOrEqual(96);
    });

    it('keeps an impossible enclosed label search finite and inside its original retreat budget', () => {
        const offset = getEdgeLabelAutoOffset(
            [{ x: 0, y: 0 }, { x: 120, y: 0 }], { x: 60, y: 0 }, 'Flow', [],
            [{ x: -10000, y: -10000, width: 20000, height: 20000 }], 2.4,
        );
        expect(Number.isFinite(offset.x) && Number.isFinite(offset.y)).toBe(true);
        expect(Math.abs(offset.x)).toBeLessThanOrEqual(96);
        expect(Math.abs(offset.y)).toBeLessThanOrEqual(40);
    });

    it.each([false, true])('fits a scaled shared-branch label into a narrow node gap (mirrored=%s)', mirrored => {
        const mirror = (x: number) => mirrored ? -x : x;
        const rect = (x: number, width: number, y: number, height: number) => ({
            x: mirrored ? -x - width : x, y, width, height,
        });
        for (const fragmentLength of [48, 60]) {
            const ownPath = [{ x: mirror(fragmentLength), y: 0 }, { x: 0, y: 0 }];
            const center = { x: mirror(fragmentLength / 2), y: 0 };
            const obstacles = [rect(-250, 250, -59, 118), rect(120, 282, -59, 118)];
            const scale = 0.72 / 0.4199312039312039;
            const offset = getEdgeLabelAutoOffset(ownPath, center, 'Flow', [], obstacles, scale);
            const labelRect = estimateEdgeLabelRect({ x: center.x + offset.x, y: offset.y }, 'Flow', scale);
            for (const obstacle of obstacles) {
                expect(labelRect.x + labelRect.width <= obstacle.x
                    || labelRect.x >= obstacle.x + obstacle.width
                    || labelRect.y + labelRect.height <= obstacle.y
                    || labelRect.y >= obstacle.y + obstacle.height).toBe(true);
            }
            expect(Math.abs(offset.x)).toBeLessThanOrEqual(96);
        }
    });

    it('skips peer-path traversal for unlabeled edges', () => {
        const edges: Edge[] = [{
            id: 'peer-edge',
            source: 'a',
            target: 'b',
            data: {
                computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            },
        }];

        expect(collectStablePathPeerPaths(edges, 'own-edge', false)).toEqual([]);
    });

    it('collects only valid paths from other edges when label avoidance is active', () => {
        const edges: Edge[] = [
            {
                id: 'own-edge',
                source: 'a',
                target: 'b',
                data: {
                    computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                },
            },
            {
                id: 'valid-peer',
                source: 'b',
                target: 'c',
                data: {
                    computedPath: [{ x: 40, y: 0 }, { x: 40, y: 100 }],
                },
            },
            {
                id: 'invalid-peer',
                source: 'c',
                target: 'd',
                data: {
                    computedPath: [{ x: Number.NaN, y: 0 }, { x: 80, y: 100 }],
                },
            },
        ];

        expect(collectStablePathPeerPaths(edges, 'own-edge', true)).toEqual([
            [{ x: 40, y: 0 }, { x: 40, y: 100 }],
        ]);
    });

    it('moves generated labels away from peer edge paths', () => {
        const offset = getEdgeLabelAutoOffset(
            [{ x: 100, y: 0 }, { x: 100, y: 200 }],
            { x: 100, y: 100 },
            '发货指令(SOP)',
            [[{ x: 130, y: 60 }, { x: 130, y: 140 }]],
        );

        expect(offset.x).toBeLessThan(-10);
        expect(Math.abs(offset.y)).toBeLessThanOrEqual(32);
    });

    it('moves generated labels away from node obstacles', () => {
        const offset = getEdgeLabelAutoOffset(
            [{ x: 0, y: 100 }, { x: 200, y: 100 }],
            { x: 100, y: 100 },
            'approval',
            [],
            [{ x: 62, y: 86, width: 76, height: 28 }],
        );

        expect(Math.abs(offset.y)).toBeGreaterThan(10);
        expect(Math.abs(offset.x)).toBeLessThanOrEqual(96);
    });

    it('accounts for readable-label scaling at overview zoom', () => {
        const labelPoint = { x: 1688, y: 1361.5 };
        const obstacle = { x: 1736, y: 1325, width: 134, height: 73 };
        const offset = getEdgeLabelAutoOffset(
            [{ x: 1688, y: 1446 }, { x: 1688, y: 1277 }],
            labelPoint,
            '作业数据回传',
            [],
            [obstacle],
            0.72 / 0.45576042278332357,
        );
        const rect = estimateEdgeLabelRect({
            x: labelPoint.x + offset.x,
            y: labelPoint.y + offset.y,
        }, '作业数据回传', 0.72 / 0.45576042278332357);

        expect(offset).not.toEqual({ x: 0, y: 0 });
        expect(rect.x + rect.width <= obstacle.x || rect.x >= obstacle.x + obstacle.width)
            .toBe(true);
    });

    it('retreats farther along an edge when near offsets cannot clear an endpoint node', () => {
        const labelPoint = { x: 180, y: 100 };
        const labelText = 'carrier';
        const obstacle = { x: 140, y: 70, width: 100, height: 60 };
        const offset = getEdgeLabelAutoOffset(
            [{ x: 0, y: 100 }, { x: 220, y: 100 }],
            labelPoint,
            labelText,
            [],
            [obstacle],
        );
        const rect = estimateEdgeLabelRect({
            x: labelPoint.x + offset.x,
            y: labelPoint.y + offset.y,
        }, labelText);

        expect(Math.abs(offset.x)).toBeGreaterThan(32);
        expect(
            rect.x + rect.width <= obstacle.x
            || rect.x >= obstacle.x + obstacle.width
            || rect.y + rect.height <= obstacle.y
            || rect.y >= obstacle.y + obstacle.height,
        ).toBe(true);
    });

    it('prioritizes clearing nodes when the clear label position is close to a peer edge', () => {
        const labelPoint = { x: 180, y: 100 };
        const labelText = 'carrier';
        const obstacle = { x: 140, y: 70, width: 100, height: 60 };
        const offset = getEdgeLabelAutoOffset(
            [{ x: 0, y: 100 }, { x: 220, y: 100 }],
            labelPoint,
            labelText,
            [[{ x: 80, y: 40 }, { x: 80, y: 160 }]],
            [obstacle],
        );
        const rect = estimateEdgeLabelRect({
            x: labelPoint.x + offset.x,
            y: labelPoint.y + offset.y,
        }, labelText);

        expect(
            rect.x + rect.width <= obstacle.x
            || rect.x >= obstacle.x + obstacle.width
            || rect.y + rect.height <= obstacle.y
            || rect.y >= obstacle.y + obstacle.height,
        ).toBe(true);
    });

    it('uses a medium retreat to fit a label between adjacent endpoint nodes', () => {
        const labelPoint = { x: 1139, y: 349 };
        const labelText = '承运商协同';
        const obstacles = [
            { x: 761, y: 290, width: 282, height: 118 },
            { x: 1163, y: 290, width: 211, height: 118 },
        ];
        const offset = getEdgeLabelAutoOffset(
            [{ x: 1043, y: 349 }, { x: 1163, y: 349 }],
            labelPoint,
            labelText,
            [],
            obstacles,
        );
        const rect = estimateEdgeLabelRect({
            x: labelPoint.x + offset.x,
            y: labelPoint.y + offset.y,
        }, labelText);

        expect(offset.x).toBe(-32);
        for (const obstacle of obstacles) {
            expect(
                rect.x + rect.width <= obstacle.x
                || rect.x >= obstacle.x + obstacle.width
                || rect.y + rect.height <= obstacle.y
                || rect.y >= obstacle.y + obstacle.height,
            ).toBe(true);
        }
    });

    it('ignores invalid peer paths and obstacle rectangles', () => {
        const offset = getEdgeLabelAutoOffset(
            [{ x: 0, y: 0 }, { x: 0, y: 100 }],
            { x: 0, y: 50 },
            '<script>alert(1)</script>safe',
            [
                [{ x: Number.NaN, y: 0 }, { x: 10, y: 100 }],
                [{ x: 40, y: 0 }, { x: 40, y: 100 }],
            ] as any,
            [
                { x: Number.POSITIVE_INFINITY, y: 0, width: 100, height: 20 },
                { x: 18, y: 38, width: 60, height: 24 },
            ] as any,
        );

        expect(Number.isFinite(offset.x)).toBe(true);
        expect(Number.isFinite(offset.y)).toBe(true);
        expect(offset.x).toBeLessThan(-10);
    });

    it('keeps measurement bounded for very long labels and invalid centers', () => {
        const rect = estimateEdgeLabelRect(
            { x: Number.NaN, y: Number.POSITIVE_INFINITY },
            `${'超长标签'.repeat(100)}<img src=x onerror=alert(1)>`,
        );

        expect(rect).toEqual({ x: -110, y: -13, width: 220, height: 26 });
    });
});
