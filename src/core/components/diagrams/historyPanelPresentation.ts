export const MAX_HISTORY_LABEL_LENGTH = 120;
export const MAX_HISTORY_CHANGE_COUNT = 9999;

export type HistoryTimePresentation =
    | { kind: 'justNow' }
    | { kind: 'secondsAgo'; count: number }
    | { kind: 'minutesAgo'; count: number }
    | { kind: 'clock'; timestamp: number }
    | { kind: 'unknown' };

export const normalizeHistoryLabel = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback;

    const withoutControls = Array.from(value, character => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127 ? ' ' : character;
    }).join('');
    const normalized = withoutControls
        .replace(/\s+/g, ' ')
        .trim();

    return (normalized || fallback).slice(0, MAX_HISTORY_LABEL_LENGTH);
};

export const normalizeHistoryChangeCount = (value: unknown, fallback: unknown): number => {
    const candidate = typeof value === 'number' && Number.isFinite(value)
        ? value
        : fallback;
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) return 0;
    return Math.min(Math.floor(candidate), MAX_HISTORY_CHANGE_COUNT);
};

export const resolveHistoryTime = (
    timestamp: unknown,
    now: unknown = Date.now(),
): HistoryTimePresentation => {
    if (
        typeof timestamp !== 'number'
        || !Number.isFinite(timestamp)
        || timestamp <= 0
        || typeof now !== 'number'
        || !Number.isFinite(now)
        || now <= 0
        || timestamp > now + 60_000
    ) {
        return { kind: 'unknown' };
    }

    const diff = Math.max(0, now - timestamp);
    if (diff < 5_000) return { kind: 'justNow' };
    if (diff < 60_000) return { kind: 'secondsAgo', count: Math.floor(diff / 1_000) };
    if (diff < 3_600_000) return { kind: 'minutesAgo', count: Math.floor(diff / 60_000) };
    return { kind: 'clock', timestamp };
};
