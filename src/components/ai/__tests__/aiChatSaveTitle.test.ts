// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { normalizeAIChatSaveTitle } from '../aiChatSave';

describe('normalizeAIChatSaveTitle', () => {
    it('normalizes empty, wrong-type, and oversized save titles', () => {
        expect(normalizeAIChatSaveTitle('  Diagram  ', 'fallback')).toBe('Diagram');
        expect(normalizeAIChatSaveTitle('', 'fallback')).toBe('fallback');
        expect(normalizeAIChatSaveTitle(null, 'fallback')).toBe('fallback');
        expect(normalizeAIChatSaveTitle('x'.repeat(500), 'fallback')).toHaveLength(200);
    });
});
