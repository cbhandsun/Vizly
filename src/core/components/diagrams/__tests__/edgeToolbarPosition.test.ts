import type { InternalNode, Node, Viewport } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
    getClampedEdgeToolbarPosition,
    getEdgeToolbarScreenPosition,
    resolveToolbarNodeCenter,
} from '../edgeToolbarPosition';

const makeNode = (overrides: Partial<Node> = {}): Node => ({
    id: 'node',
    position: { x: 10, y: 20 },
    data: {},
    measured: { width: 100, height: 40 },
    ...overrides,
});

const makeInternalNode = (
    position: Node['position'],
    absolutePosition: Node['position'],
): InternalNode => ({
    ...makeNode({ position }),
    measured: { width: 100, height: 40 },
    internals: {
        positionAbsolute: absolutePosition,
        userNode: makeNode({ position }),
        z: 0,
        handleBounds: undefined,
        bounds: undefined,
    },
});

describe('edge toolbar position', () => {
    it('uses React Flow absolute coordinates for nodes nested inside a parent', () => {
        const child = makeInternalNode({ x: 20, y: 30 }, { x: 420, y: 330 });

        expect(resolveToolbarNodeCenter(child)).toEqual({ x: 470, y: 350 });
    });

    it('falls back to public node coordinates and default dimensions', () => {
        const node = makeNode({ measured: undefined, width: undefined, height: undefined });

        expect(resolveToolbarNodeCenter(node)).toEqual({ x: 70, y: 50 });
    });

    it('converts the absolute midpoint into screen coordinates', () => {
        const source = makeInternalNode({ x: 0, y: 0 }, { x: 200, y: 300 });
        const target = makeInternalNode({ x: 0, y: 0 }, { x: 600, y: 500 });
        const viewport: Viewport = { x: 100, y: 50, zoom: 0.5 };

        expect(getEdgeToolbarScreenPosition(source, target, viewport)).toEqual({
            x: 325,
            y: 260,
        });
    });

    it('rejects missing nodes and non-finite or non-positive viewports', () => {
        const node = makeNode();

        expect(getEdgeToolbarScreenPosition(undefined, node, { x: 0, y: 0, zoom: 1 })).toBeNull();
        expect(getEdgeToolbarScreenPosition(node, node, { x: 0, y: 0, zoom: 0 })).toBeNull();
        expect(getEdgeToolbarScreenPosition(node, node, { x: Number.NaN, y: 0, zoom: 1 })).toBeNull();
    });

    it('keeps a measured toolbar inside horizontal and vertical bounds', () => {
        expect(getClampedEdgeToolbarPosition(
            { x: 560, y: 120 },
            { width: 577, height: 900 },
            { width: 390, height: 60 },
        )).toEqual({ x: 171, y: 44, placement: 'above' });
    });

    it('places the toolbar below an edge when there is no room above', () => {
        expect(getClampedEdgeToolbarPosition(
            { x: 180, y: 40 },
            { width: 400, height: 300 },
            { width: 200, height: 60 },
        )).toEqual({ x: 80, y: 56, placement: 'below' });
    });

    it('rejects invalid toolbar geometry instead of producing unsafe coordinates', () => {
        expect(getClampedEdgeToolbarPosition(
            { x: 100, y: 100 },
            { width: 0, height: 300 },
            { width: 200, height: 60 },
        )).toBeNull();
        expect(getClampedEdgeToolbarPosition(
            { x: Number.POSITIVE_INFINITY, y: 100 },
            { width: 400, height: 300 },
            { width: 200, height: 60 },
        )).toBeNull();
    });
});
