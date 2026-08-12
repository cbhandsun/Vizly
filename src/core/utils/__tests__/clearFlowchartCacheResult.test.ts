// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearFlowchartCache } from '../clearFlowchartCache';

describe('clearFlowchartCache result', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reports success only after every planned removal completes', () => {
        const result = clearFlowchartCache('diagram-a');

        expect(result.ok).toBe(true);
        expect(result.failures).toEqual([]);
        expect(result.removedCount).toBeGreaterThan(0);
    });

    it('returns a structured failure when browser storage rejects a removal', () => {
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
            if (key === 'flowchart-clipboard') throw new DOMException('blocked', 'SecurityError');
        });

        const result = clearFlowchartCache('diagram-a');

        expect(result.ok).toBe(false);
        expect(result.failures).toContainEqual({
            storageType: 'localStorage',
            operation: 'remove',
            key: 'flowchart-clipboard',
        });
    });
});
