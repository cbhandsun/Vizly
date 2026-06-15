import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../formatRelativeTime';

describe('formatRelativeTime', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);

    it('handles current and invalid values', () => {
        expect(formatRelativeTime(now, now)).toBe('just now');
        expect(formatRelativeTime('not-a-date', now)).toBe('');
    });

    it('formats past values with boundary-safe units', () => {
        expect(formatRelativeTime(now - 30_000, now)).toBe('a few seconds ago');
        expect(formatRelativeTime(now - 2 * 60_000, now)).toBe('2 minutes ago');
        expect(formatRelativeTime(now - 2 * 60 * 60_000, now)).toBe('2 hours ago');
        expect(formatRelativeTime(now - 2 * 30 * 24 * 60 * 60_000, now)).toBe('2 months ago');
    });

    it('formats future values', () => {
        expect(formatRelativeTime(now + 60_000, now)).toBe('in a minute');
        expect(formatRelativeTime(now + 3 * 24 * 60 * 60_000, now)).toBe('in 3 days');
    });
});
