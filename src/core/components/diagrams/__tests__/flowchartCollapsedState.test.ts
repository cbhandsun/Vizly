import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { computeFlowchartCollapsedStateHash } from '../flowchartCollapsedState';

const node = (
    id: string,
    collapsed?: boolean,
): Node => ({
    id,
    position: { x: 0, y: 0 },
    data: collapsed === undefined ? {} : { collapsed },
});

describe('computeFlowchartCollapsedStateHash', () => {
    it('ignores ordinary node additions, selections, measurements, and ordering', () => {
        const collapsed = node('group', false);
        const first = node('first');
        const second = node('second');

        expect(computeFlowchartCollapsedStateHash([collapsed, first])).toBe('group:0');
        expect(computeFlowchartCollapsedStateHash([
            { ...second, selected: true, measured: { width: 100, height: 60 } },
            first,
            collapsed,
        ])).toBe('group:0');
    });

    it('changes only when an explicit collapse state changes', () => {
        expect(computeFlowchartCollapsedStateHash([node('group', false)])).toBe('group:0');
        expect(computeFlowchartCollapsedStateHash([node('group', true)])).toBe('group:1');
        expect(computeFlowchartCollapsedStateHash([node('group')])).toBe('');
    });
});
