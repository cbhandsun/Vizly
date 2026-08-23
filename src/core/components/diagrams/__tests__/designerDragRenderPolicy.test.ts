import { describe, expect, it } from 'vitest';

import { resolveDesignerDragRenderPolicy } from '../designerDragRenderPolicy';

describe('resolveDesignerDragRenderPolicy', () => {
    it('keeps the performance projection through the bounded post-drop settle window', () => {
        expect(resolveDesignerDragRenderPolicy({
            isDragging: false,
            isDraggingNode: true,
            performanceMode: false,
        })).toEqual({
            canvasDragActive: true,
            usePerformanceNodes: true,
        });
    });

    it('releases the drag projection after both drag states settle', () => {
        expect(resolveDesignerDragRenderPolicy({
            isDragging: false,
            isDraggingNode: false,
            performanceMode: false,
        })).toEqual({
            canvasDragActive: false,
            usePerformanceNodes: false,
        });
    });

    it('preserves the high-density performance projection outside a drag', () => {
        expect(resolveDesignerDragRenderPolicy({
            isDragging: false,
            isDraggingNode: false,
            performanceMode: true,
        })).toEqual({
            canvasDragActive: false,
            usePerformanceNodes: true,
        });
    });
});
