type RelativeUnit = {
    thresholdMs: number;
    unitMs: number;
    singular: string;
    plural: string;
    fixed?: boolean;
};

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const RELATIVE_UNITS: RelativeUnit[] = [
    { thresholdMs: 45 * SECOND_MS, unitMs: SECOND_MS, singular: 'a few seconds', plural: 'a few seconds', fixed: true },
    { thresholdMs: 90 * SECOND_MS, unitMs: MINUTE_MS, singular: 'a minute', plural: 'minutes' },
    { thresholdMs: 45 * MINUTE_MS, unitMs: MINUTE_MS, singular: 'a minute', plural: 'minutes' },
    { thresholdMs: 90 * MINUTE_MS, unitMs: HOUR_MS, singular: 'an hour', plural: 'hours' },
    { thresholdMs: 22 * HOUR_MS, unitMs: HOUR_MS, singular: 'an hour', plural: 'hours' },
    { thresholdMs: 36 * HOUR_MS, unitMs: DAY_MS, singular: 'a day', plural: 'days' },
    { thresholdMs: 26 * DAY_MS, unitMs: DAY_MS, singular: 'a day', plural: 'days' },
    { thresholdMs: 45 * DAY_MS, unitMs: MONTH_MS, singular: 'a month', plural: 'months' },
    { thresholdMs: 320 * DAY_MS, unitMs: MONTH_MS, singular: 'a month', plural: 'months' },
    { thresholdMs: 548 * DAY_MS, unitMs: YEAR_MS, singular: 'a year', plural: 'years' },
    { thresholdMs: Number.POSITIVE_INFINITY, unitMs: YEAR_MS, singular: 'a year', plural: 'years' },
];

export function formatRelativeTime(value: Date | number | string, now: number = Date.now()): string {
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();

    if (!Number.isFinite(time)) {
        return '';
    }

    const diffMs = time - now;
    const absMs = Math.abs(diffMs);

    if (absMs < 5 * SECOND_MS) {
        return 'just now';
    }

    const unit = RELATIVE_UNITS.find((candidate) => absMs < candidate.thresholdMs) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
    const count = Math.max(1, Math.round(absMs / unit.unitMs));
    const phrase = unit.fixed || count === 1
        ? unit.singular
        : `${count} ${unit.plural}`;

    return diffMs > 0 ? `in ${phrase}` : `${phrase} ago`;
}
