import { describe, expect, it } from 'vitest';
import { calculateQuickCloneViewportAdjustment } from '../../custom-nodes/flowchartQuickClone';

describe('flowchart viewport safe area', () => {
    it('moves a newly added node above mobile page controls', () => {
        expect(calculateQuickCloneViewportAdjustment({
            containerWidth: 374,
            containerHeight: 612,
            visibleLeft: 0,
            visibleRight: 374,
            visibleTop: 95,
            visibleBottom: 410,
            nodeX: 169,
            nodeY: 334,
            nodeWidth: 80,
            nodeHeight: 100,
            viewportX: 0,
            viewportY: 0,
            zoom: 1,
        })).toEqual({
            x: 0,
            y: -131.5,
            zoom: 1,
        });
    });

    it('keeps a node that is already inside the safe area stationary', () => {
        expect(calculateQuickCloneViewportAdjustment({
            containerWidth: 374,
            containerHeight: 612,
            visibleLeft: 0,
            visibleRight: 374,
            visibleTop: 95,
            visibleBottom: 410,
            nodeX: 147,
            nodeY: 200,
            nodeWidth: 80,
            nodeHeight: 60,
            viewportX: 0,
            viewportY: 0,
            zoom: 1,
            margin: 24,
        })).toBeNull();
    });
});
