import { describe, expect, it } from 'vitest';

import {
    DEFAULT_VERSION_MESSAGE,
    normalizeVersionMessage,
    VERSION_MESSAGE_MAX_LENGTH,
} from '../versionHistoryInput';

describe('normalizeVersionMessage', () => {
    it('normalizes whitespace and removes unsafe control characters', () => {
        expect(normalizeVersionMessage('  发布\n\t版本\u0000  ')).toBe('发布 版本');
    });

    it('uses the default for empty and non-string input', () => {
        expect(normalizeVersionMessage('   ')).toBe(DEFAULT_VERSION_MESSAGE);
        expect(normalizeVersionMessage(null)).toBe(DEFAULT_VERSION_MESSAGE);
    });

    it('bounds exceptionally long input', () => {
        expect(normalizeVersionMessage('a'.repeat(500))).toHaveLength(VERSION_MESSAGE_MAX_LENGTH);
    });
});
