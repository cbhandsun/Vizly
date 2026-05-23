import { describe, it, expect, vi } from 'vitest';
import {
    calculateGridLayout,
    calculateHorizontalLayout,
    calculateVerticalLayout,
    calculateCenteredLayout,
    calculateLayout
} from '../basicLayouts';
import { LayoutType, AlignmentType, LayoutOptions } from '../../../types/layout';
import { calculateHierarchicalLayout } from '../hierarchicalLayout';

// Mock hierarchicalLayout to isolate testing of basicLayouts
vi.mock('../hierarchicalLayout', () => ({
    calculateHierarchicalLayout: vi.fn(() => ({
        positions: [{ x: 123, y: 456 }]
    }))
}));

describe('basicLayouts', () => {
    describe('calculateGridLayout', () => {
        it('should calculate positions correctly with default options', () => {
            const items = [{}, {}, {}];
            const options: LayoutOptions = {}; // columns will be Math.ceil(sqrt(3)) = 2
            const positions = calculateGridLayout(items, options);

            expect(positions).toHaveLength(3);
            // Default options: spacing.horiz=100, spacing.vert=120, padding.left=50, padding.top=50, itemSize=(280,120)
            // col 0, row 0 -> (50, 50)
            // col 1, row 0 -> (50 + 280 + 100 = 430, 50)
            // col 0, row 1 -> (50, 50 + 120 + 120 = 290)
            expect(positions[0]).toEqual({ x: 50, y: 50 });
            expect(positions[1]).toEqual({ x: 430, y: 50 });
            expect(positions[2]).toEqual({ x: 50, y: 290 });
        });

        it('should respect custom columns, spacing and padding options', () => {
            const items = [{}, {}, {}];
            const options: LayoutOptions = {
                columns: 3,
                spacing: { horizontal: 50, vertical: 60 },
                padding: { top: 10, right: 10, bottom: 10, left: 20 },
                itemSize: { width: 100, height: 50 }
            };
            const positions = calculateGridLayout(items, options);

            expect(positions).toHaveLength(3);
            // col 0, row 0 -> (20, 10)
            // col 1, row 0 -> (20 + 100 + 50 = 170, 10)
            // col 2, row 0 -> (170 + 100 + 50 = 320, 10)
            expect(positions[0]).toEqual({ x: 20, y: 10 });
            expect(positions[1]).toEqual({ x: 170, y: 10 });
            expect(positions[2]).toEqual({ x: 320, y: 10 });
        });
    });

    describe('calculateHorizontalLayout', () => {
        const items = [{}, {}, {}];
        const baseOptions: LayoutOptions = {
            spacing: { horizontal: 50, vertical: 0 },
            padding: { top: 20, right: 20, bottom: 20, left: 20 },
            itemSize: { width: 100, height: 40 },
            containerSize: { width: 500, height: 200 }
        };

        it('should align LEFT correctly', () => {
            const options = { ...baseOptions, alignment: AlignmentType.LEFT };
            const positions = calculateHorizontalLayout(items, options);

            expect(positions).toHaveLength(3);
            // totalWidth = 3 * 100 + 2 * 50 = 400
            // startX = padding.left = 20
            // startY = padding.top = 20
            // pos0: (20, 20)
            // pos1: (20 + 100 + 50 = 170, 20)
            // pos2: (170 + 100 + 50 = 320, 20)
            expect(positions[0]).toEqual({ x: 20, y: 20 });
            expect(positions[1]).toEqual({ x: 170, y: 20 });
            expect(positions[2]).toEqual({ x: 320, y: 20 });
        });

        it('should align CENTER correctly', () => {
            const options = { ...baseOptions, alignment: AlignmentType.CENTER };
            const positions = calculateHorizontalLayout(items, options);

            expect(positions).toHaveLength(3);
            // totalWidth = 400
            // startX = (500 - 400) / 2 = 50
            // startY = (200 - 40) / 2 = 80
            // pos0: (50, 80)
            // pos1: (50 + 150 = 200, 80)
            // pos2: (200 + 150 = 350, 80)
            expect(positions[0]).toEqual({ x: 50, y: 80 });
            expect(positions[1]).toEqual({ x: 200, y: 80 });
            expect(positions[2]).toEqual({ x: 350, y: 80 });
        });

        it('should align RIGHT correctly', () => {
            const options = { ...baseOptions, alignment: AlignmentType.RIGHT };
            const positions = calculateHorizontalLayout(items, options);

            expect(positions).toHaveLength(3);
            // totalWidth = 400
            // startX = 500 - 400 - padding.right(20) = 80
            // startY = padding.top = 20
            expect(positions[0]).toEqual({ x: 80, y: 20 });
            expect(positions[1]).toEqual({ x: 230, y: 20 });
            expect(positions[2]).toEqual({ x: 380, y: 20 });
        });
    });

    describe('calculateVerticalLayout', () => {
        const items = [{}, {}, {}];
        const baseOptions: LayoutOptions = {
            spacing: { horizontal: 0, vertical: 30 },
            padding: { top: 20, right: 20, bottom: 20, left: 20 },
            itemSize: { width: 100, height: 40 },
            containerSize: { width: 400, height: 300 }
        };

        it('should align TOP correctly', () => {
            const options = { ...baseOptions, alignment: AlignmentType.TOP };
            const positions = calculateVerticalLayout(items, options);

            expect(positions).toHaveLength(3);
            // totalHeight = 3 * 40 + 2 * 30 = 180
            // startY = padding.top = 20
            // startX = padding.left = 20
            expect(positions[0]).toEqual({ x: 20, y: 20 });
            expect(positions[1]).toEqual({ x: 20, y: 90 });
            expect(positions[2]).toEqual({ x: 20, y: 160 });
        });

        it('should align CENTER correctly', () => {
            const options = { ...baseOptions, alignment: AlignmentType.CENTER };
            const positions = calculateVerticalLayout(items, options);

            expect(positions).toHaveLength(3);
            // totalHeight = 180
            // startY = (300 - 180) / 2 = 60
            // startX = (400 - 100) / 2 = 150
            expect(positions[0]).toEqual({ x: 150, y: 60 });
            expect(positions[1]).toEqual({ x: 150, y: 130 });
            expect(positions[2]).toEqual({ x: 150, y: 200 });
        });

        it('should align BOTTOM correctly', () => {
            const options = { ...baseOptions, alignment: AlignmentType.BOTTOM };
            const positions = calculateVerticalLayout(items, options);

            expect(positions).toHaveLength(3);
            // totalHeight = 180
            // startY = 300 - 180 - padding.bottom(20) = 100
            // startX = padding.left = 20
            expect(positions[0]).toEqual({ x: 20, y: 100 });
            expect(positions[1]).toEqual({ x: 20, y: 170 });
            expect(positions[2]).toEqual({ x: 20, y: 240 });
        });
    });

    describe('calculateCenteredLayout', () => {
        const baseOptions: LayoutOptions = {
            containerSize: { width: 500, height: 400 },
            itemSize: { width: 100, height: 50 },
            spacing: { horizontal: 20, vertical: 20 }
        };

        it('should center a single item correctly', () => {
            const items = [{}];
            const positions = calculateCenteredLayout(items, baseOptions);

            expect(positions).toHaveLength(1);
            // x = (500 - 100) / 2 = 200
            // y = (400 - 50) / 2 = 175
            expect(positions[0]).toEqual({ x: 200, y: 175 });
        });

        it('should center multiple items in a grid correctly', () => {
            const items = [{}, {}, {}]; // columns will be 2, rows will be 2
            const positions = calculateCenteredLayout(items, baseOptions);

            expect(positions).toHaveLength(3);
            // columns = 2, rows = 2
            // totalWidth = 2 * 100 + 1 * 20 = 220
            // totalHeight = 2 * 50 + 1 * 20 = 120
            // startX = (500 - 220) / 2 = 140
            // startY = (400 - 120) / 2 = 140
            // col 0, row 0 -> (140, 140)
            // col 1, row 0 -> (140 + 120 = 260, 140)
            // col 0, row 1 -> (140, 140 + 70 = 210)
            expect(positions[0]).toEqual({ x: 140, y: 140 });
            expect(positions[1]).toEqual({ x: 260, y: 140 });
            expect(positions[2]).toEqual({ x: 140, y: 210 });
        });
    });

    describe('calculateLayout', () => {
        const items = [{}, {}, {}];
        const options: LayoutOptions = {
            spacing: { horizontal: 100, vertical: 120 },
            padding: { top: 50, right: 50, bottom: 50, left: 50 },
            itemSize: { width: 280, height: 120 }
        };

        it('should route LayoutType.GRID to calculateGridLayout', () => {
            const positions = calculateLayout(items, { ...options, type: LayoutType.GRID });
            expect(positions[0]).toEqual({ x: 50, y: 50 });
        });

        it('should route LayoutType.HORIZONTAL to calculateHorizontalLayout', () => {
            const positions = calculateLayout(items, { ...options, type: LayoutType.HORIZONTAL, containerSize: { width: 1000, height: 500 } });
            // Total width = 3*280 + 2*100 = 1040. startX = (1000 - 1040)/2 = -20
            expect(positions[0].x).toBe(-20);
        });

        it('should route LayoutType.VERTICAL to calculateVerticalLayout', () => {
            const positions = calculateLayout(items, { ...options, type: LayoutType.VERTICAL, containerSize: { width: 1000, height: 1000 } });
            // Total height = 3*120 + 2*120 = 600. startY = (1000 - 600)/2 = 200
            expect(positions[0].y).toBe(200);
        });

        it('should route LayoutType.CENTERED to calculateCenteredLayout', () => {
            const positions = calculateLayout(items, { ...options, type: LayoutType.CENTERED, containerSize: { width: 1000, height: 1000 } });
            // columns = 2, rows = 2. totalWidth = 2*280 + 100 = 660. startX = (1000-660)/2 = 170
            expect(positions[0].x).toBe(170);
        });

        it('should route LayoutType.HIERARCHICAL to calculateHierarchicalLayout', () => {
            const flowItems = [
                { id: '1', position: { x: 0, y: 0 } },
                { id: '2', position: { x: 0, y: 0 } },
                { id: 'e1', source: '1', target: '2' }
            ];
            const positions = calculateLayout(flowItems, { ...options, type: LayoutType.HIERARCHICAL });

            // Should trigger the mocked calculateHierarchicalLayout
            expect(calculateHierarchicalLayout).toHaveBeenCalled();
            expect(positions).toEqual([{ x: 123, y: 456 }]);
        });

        it('should default to GRID when LayoutType is unknown', () => {
            const positions = calculateLayout(items, { ...options, type: 'UNKNOWN' as any });
            expect(positions[0]).toEqual({ x: 50, y: 50 });
        });
    });
});
