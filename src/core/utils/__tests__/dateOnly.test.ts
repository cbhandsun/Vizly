import { describe, expect, it } from 'vitest';
import { addDaysToDateOnly, formatDateOnly, parseDateOnlyTime } from '../dateOnly';

describe('dateOnly utilities', () => {
    it('formats local date-only strings', () => {
        expect(formatDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('parses valid date-only input and rejects invalid input', () => {
        expect(parseDateOnlyTime('2026-02-03')).toBe(new Date(2026, 1, 3).getTime());
        expect(parseDateOnlyTime('')).toBeNull();
        expect(parseDateOnlyTime('not-a-date')).toBeNull();
        expect(parseDateOnlyTime('2026-02-31')).toBeNull();
        expect(parseDateOnlyTime('2026-00-10')).toBeNull();
        expect(parseDateOnlyTime('2026-01-00')).toBeNull();
    });

    it('adds days across month and leap-year boundaries', () => {
        expect(addDaysToDateOnly('2026-01-31', 2)).toBe('2026-02-02');
        expect(addDaysToDateOnly('2024-02-28', 1)).toBe('2024-02-29');
    });

    it('uses the fallback for invalid base values', () => {
        expect(addDaysToDateOnly('bad', 2, '2026-06-01')).toBe('2026-06-03');
    });
});
