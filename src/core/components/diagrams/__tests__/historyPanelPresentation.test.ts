import { describe, expect, it } from 'vitest';

import {
    MAX_HISTORY_CHANGE_COUNT,
    MAX_HISTORY_LABEL_LENGTH,
    normalizeHistoryChangeCount,
    normalizeHistoryLabel,
    resolveHistoryTime,
} from '../historyPanelPresentation';

describe('historyPanelPresentation', () => {
    it('normalizes labels without letting control characters or unbounded text reach the panel', () => {
        expect(normalizeHistoryLabel('  复制\u0000\n节点  ', '回退')).toBe('复制 节点');
        expect(normalizeHistoryLabel('', '回退')).toBe('回退');
        expect(normalizeHistoryLabel(undefined, '回退')).toBe('回退');
        expect(normalizeHistoryLabel('x'.repeat(300), '回退')).toHaveLength(MAX_HISTORY_LABEL_LENGTH);
    });

    it('coerces invalid and extreme change counts into a bounded display value', () => {
        expect(normalizeHistoryChangeCount(4.9, 0)).toBe(4);
        expect(normalizeHistoryChangeCount(undefined, 3)).toBe(3);
        expect(normalizeHistoryChangeCount(-1, 2)).toBe(0);
        expect(normalizeHistoryChangeCount(Number.POSITIVE_INFINITY, Number.NaN)).toBe(0);
        expect(normalizeHistoryChangeCount(50_000, 0)).toBe(MAX_HISTORY_CHANGE_COUNT);
    });

    it('resolves relative, clock, invalid, and future timestamps explicitly', () => {
        const now = 1_800_000_000_000;
        expect(resolveHistoryTime(now - 2_000, now)).toEqual({ kind: 'justNow' });
        expect(resolveHistoryTime(now - 20_000, now)).toEqual({ kind: 'secondsAgo', count: 20 });
        expect(resolveHistoryTime(now - 120_000, now)).toEqual({ kind: 'minutesAgo', count: 2 });
        expect(resolveHistoryTime(now - 7_200_000, now)).toEqual({ kind: 'clock', timestamp: now - 7_200_000 });
        expect(resolveHistoryTime(Number.NaN, now)).toEqual({ kind: 'unknown' });
        expect(resolveHistoryTime(now + 120_000, now)).toEqual({ kind: 'unknown' });
    });
});
