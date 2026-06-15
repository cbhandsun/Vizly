import { describe, expect, it } from 'vitest';
import {
    addWorkDays,
    adjustToWorkDay,
    getWorkDays,
    getWorkDaysSigned,
    isWeekend,
    useProTimelineEngine,
} from '../useProTimelineEngine';

describe('useProTimelineEngine date helpers', () => {
    it('round-trips date-only coordinates without UTC day drift', () => {
        const { dateToX, xToDate } = useProTimelineEngine.getState();

        expect(dateToX('2026-01-01')).toBe(0);
        expect(xToDate(dateToX('2026-06-13'))).toBe('2026-06-13');
    });

    it('adjusts weekends to working days', () => {
        expect(isWeekend('2026-06-13')).toBe(true);
        expect(adjustToWorkDay('2026-06-13', 'forward')).toBe('2026-06-15');
        expect(adjustToWorkDay('2026-06-13', 'backward')).toBe('2026-06-12');
    });

    it('counts and adds inclusive workdays across weekends', () => {
        expect(getWorkDays('2026-06-12', '2026-06-16')).toBe(3);
        expect(addWorkDays('2026-06-12', 2)).toBe('2026-06-15');
        expect(getWorkDaysSigned('2026-06-12', '2026-06-16')).toBe(2);
        expect(getWorkDaysSigned('2026-06-16', '2026-06-12')).toBe(-2);
    });

    it('handles invalid dates defensively', () => {
        expect(isWeekend('2026-02-31')).toBe(false);
        expect(getWorkDays('2026-02-31', '2026-03-02')).toBe(0);
        expect(getWorkDaysSigned('bad', '2026-03-02')).toBe(0);
    });
});
