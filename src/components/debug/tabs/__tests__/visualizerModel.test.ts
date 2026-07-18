import { describe, expect, it } from 'vitest';
import {
    calculateVisualizerFit,
    normalizeVisibilityGraph,
    type DebugPayload,
} from '../visualizerModel';

describe('normalizeVisibilityGraph', () => {
    it('normalizes tuple and object edge formats', () => {
        expect(normalizeVisibilityGraph([
            [{ x: 1, y: 2 }, { x: 3, y: 4 }],
            { x1: 5, y1: 6, x2: 7, y2: 8 },
        ])).toEqual([
            [{ x: 1, y: 2 }, { x: 3, y: 4 }],
            [{ x: 5, y: 6 }, { x: 7, y: 8 }],
        ]);
    });

    it('rejects malformed and non-finite external edges', () => {
        expect(normalizeVisibilityGraph({
            edges: [null, [], { x1: 0, y1: 0, x2: Infinity, y2: 1 }],
        })).toEqual([]);
        expect(normalizeVisibilityGraph(null)).toEqual([]);
    });
});

describe('calculateVisualizerFit', () => {
    const viewport = { width: 300, height: 300 };

    it('centers and scales a normal path', () => {
        const data = { path: [{ x: 0, y: 0 }, { x: 100, y: 100 }] } as DebugPayload;
        expect(calculateVisualizerFit(data, viewport)).toEqual({ x: 50, y: 50, k: 2 });
    });

    it('returns null for empty content and invalid viewports', () => {
        expect(calculateVisualizerFit({} as DebugPayload, viewport)).toBeNull();
        expect(calculateVisualizerFit({ path: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } as DebugPayload, {
            width: Number.NaN,
            height: 300,
        })).toBeNull();
        expect(calculateVisualizerFit({ path: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } as DebugPayload, {
            width: -1,
            height: 300,
        })).toBeNull();
    });

    it('ignores malformed coordinates and negative rectangles', () => {
        const data = {
            path: [{ x: Number.NaN, y: 0 }],
            algorithmDebug: { sourceRect: { x: 0, y: 0, width: -10, height: 20 } },
        } as unknown as DebugPayload;
        expect(calculateVisualizerFit(data, viewport)).toBeNull();
    });

    it('fits obstacle-only debug payloads', () => {
        const data = { obstacles: [{ x: 10, y: 20, width: 100, height: 50 }] } as DebugPayload;
        expect(calculateVisualizerFit(data, { width: 300, height: 200 })).toEqual({ x: 30, y: 10, k: 2 });
    });

    it('excludes distant obstacles when primary path content exists', () => {
        const data = {
            path: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
            obstacles: [{ x: 10_000, y: 10_000, width: 100, height: 100 }],
        } as DebugPayload;
        expect(calculateVisualizerFit(data, viewport)).toEqual({ x: 50, y: 50, k: 2 });
    });

    it('clamps extreme scales to safe bounds', () => {
        const tiny = { path: [{ x: 0, y: 0 }, { x: 0.001, y: 0.001 }] } as DebugPayload;
        const huge = { path: [{ x: 0, y: 0 }, { x: 1_000_000, y: 1_000_000 }] } as DebugPayload;
        expect(calculateVisualizerFit(tiny, viewport)?.k).toBe(4);
        expect(calculateVisualizerFit(huge, viewport)?.k).toBe(0.05);
    });
});
