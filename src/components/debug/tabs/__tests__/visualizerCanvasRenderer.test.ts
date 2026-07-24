// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { drawVisualizerCanvas } from '../visualizerCanvasRenderer';
import type { DebugPayload } from '../visualizerModel';

const createCanvas = () => {
    const context = {
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        arc: vi.fn(),
        setLineDash: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        font: '',
        textBaseline: '',
        lineWidth: 0,
        globalAlpha: 1,
    };
    const canvas = {
        width: 800,
        height: 600,
        getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    return { canvas, context };
};

const options = {
    showGrid: false,
    showObstacles: true,
    showVG: true,
    showQuadTree: false,
    showTrunk: true,
    transform: { x: 0, y: 0, k: 1 },
    viewport: { width: 800, height: 600 },
};

describe('drawVisualizerCanvas', () => {
    it('renders a bounded summary for an empty debug payload', () => {
        const { canvas, context } = createCanvas();

        drawVisualizerCanvas(canvas, {} as DebugPayload, options);

        expect(context.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
        expect(context.fillText).toHaveBeenCalledWith(
            'Grid: false | Path: 0 | Raw: 0 | Obs: 0 | VG: 0 | Visited: 0',
            8,
            6,
        );
    });

    it('renders paths, trunk metadata, and peer obstacle outlines', () => {
        const { canvas, context } = createCanvas();
        const data = {
            pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            obstacles: [{ id: 'peer-a', x: 20, y: 10, width: 40, height: 20 }],
            algorithmDebug: {
                portSelection: {
                    trunkAxis: 50,
                    trunkVertical: true,
                    peerGroupMembers: ['peer-a'],
                },
            },
        } as unknown as DebugPayload;

        drawVisualizerCanvas(canvas, data, options);

        expect(context.lineTo).toHaveBeenCalled();
        expect(context.setLineDash).toHaveBeenCalledWith([6, 4]);
        expect(context.fillText).toHaveBeenCalledWith('trunk x=50', 54, 22);
        expect(context.strokeRect).toHaveBeenCalledWith(18, 8, 44, 24);
    });

    it('keeps the default visited-node size when only a drawing grid is inferred', () => {
        const { canvas, context } = createCanvas();
        const data = {
            pathPoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
            visited: [{ x: 0, y: 0 }],
        } as DebugPayload;

        drawVisualizerCanvas(canvas, data, options);

        expect(context.fillRect).toHaveBeenCalledWith(-6, -6, 12, 12);
    });
});
