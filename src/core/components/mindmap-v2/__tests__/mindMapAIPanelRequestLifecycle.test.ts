import { describe, expect, it } from 'vitest';

import { createMindMapAIRequestLifecycle } from '../mindMapAIPanelRequestLifecycle';

describe('mind-map AI panel request lifecycle', () => {
    it('keeps only the newest request current', () => {
        const lifecycle = createMindMapAIRequestLifecycle();
        const older = lifecycle.begin();
        const newer = lifecycle.begin();

        expect(lifecycle.isCurrent(older)).toBe(false);
        expect(lifecycle.isCurrent(newer)).toBe(true);
    });

    it('invalidates the active request when UI context changes', () => {
        const lifecycle = createMindMapAIRequestLifecycle();
        const requestId = lifecycle.begin();

        lifecycle.invalidate();

        expect(lifecycle.isCurrent(requestId)).toBe(false);
    });
});
