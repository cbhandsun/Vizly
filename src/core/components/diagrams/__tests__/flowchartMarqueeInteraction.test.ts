import { describe, expect, it } from 'vitest';
import { SelectionMode } from '@xyflow/react';

import {
    getFlowchartMarqueeCanvasInteraction,
    getFlowchartMarqueeEdges,
} from '../flowchartMarqueeInteraction';

describe('flowchart marquee canvas interaction', () => {
    it('enables selection drag and disables pane panning in marquee mode', () => {
        expect(getFlowchartMarqueeCanvasInteraction(true)).toEqual({
            selectionOnDrag: true,
            panOnDrag: false,
            selectionMode: SelectionMode.Full,
        });
    });

    it('restores the standard pointer interaction outside marquee mode', () => {
        expect(getFlowchartMarqueeCanvasInteraction(false)).toEqual({
            selectionOnDrag: false,
            panOnDrag: undefined,
            selectionMode: SelectionMode.Partial,
        });
    });

    it('keeps marquee selection node-only so routed lines do not inflate the selection', () => {
        const edges = [
            { id: 'selectable', source: 'a', target: 'b', selected: true },
            { id: 'locked', source: 'b', target: 'c', selectable: false },
        ];

        const marqueeEdges = getFlowchartMarqueeEdges(edges, true);

        expect(marqueeEdges).toEqual([
            { ...edges[0], selectable: false, selected: false },
            edges[1],
        ]);
        expect(marqueeEdges[1]).toBe(edges[1]);
        expect(getFlowchartMarqueeEdges(edges, false)).toBe(edges);
    });
});
