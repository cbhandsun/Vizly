import { describe, expect, it } from 'vitest';

import {
    shouldFitFlowchartAfterMobileTransition,
    shouldShowFlowchartMinimapByDefault,
} from '../flowchartResponsiveChrome';

describe('flowchart responsive chrome', () => {
    it('shows the minimap only by default on desktop', () => {
        expect(shouldShowFlowchartMinimapByDefault(false)).toBe(true);
        expect(shouldShowFlowchartMinimapByDefault(true)).toBe(false);
    });

    it('fits existing content when entering the mobile layout', () => {
        expect(shouldFitFlowchartAfterMobileTransition(false, true, 2)).toBe(true);
    });

    it.each([
        { wasMobile: true, isMobile: true, nodeCount: 2 },
        { wasMobile: false, isMobile: false, nodeCount: 2 },
        { wasMobile: false, isMobile: true, nodeCount: 0 },
        { wasMobile: false, isMobile: true, nodeCount: Number.NaN },
    ])('does not refit for stable, empty, or invalid states', (input) => {
        expect(shouldFitFlowchartAfterMobileTransition(
            input.wasMobile,
            input.isMobile,
            input.nodeCount,
        )).toBe(false);
    });
});
