import { describe, expect, it } from 'vitest';

import { supportsReactFlowMinimap } from '../reactFlowMinimapCapability';

describe('supportsReactFlowMinimap', () => {
    it('keeps the React Flow minimap enabled for plugins that do not opt out', () => {
        expect(supportsReactFlowMinimap(undefined)).toBe(true);
        expect(supportsReactFlowMinimap(null)).toBe(true);
        expect(supportsReactFlowMinimap({})).toBe(true);
        expect(supportsReactFlowMinimap({ hideMiniMap: false })).toBe(true);
    });

    it('disables the React Flow minimap for self-rendered plugin canvases', () => {
        expect(supportsReactFlowMinimap({ hideMiniMap: true })).toBe(false);
    });
});
