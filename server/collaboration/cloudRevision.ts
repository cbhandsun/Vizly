/** Keep the exact Postgres timestamp: Date.toISOString loses microseconds. */
export const parseCloudDiagramRevision = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.length > 40) return null;
    const parts = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::\d{2})?)$/.exec(value);
    if (!parts) return null;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = parts;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
        || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) return null;
    if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 14
        || Number(zone.slice(4) || '0') > 59
        || (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4) || '0') !== 0))) return null;
    return value;
};

/** Compare exact microseconds; retain the original timestamp as the CAS token. */
export const compareCloudRevisions = (left: string, right: string): number => {
    const ticks = (value: string): bigint => {
        if (!parseCloudDiagramRevision(value)) throw new Error('Invalid cloud revision');
        const parts = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::\d{2})?)$/.exec(value);
        if (!parts) throw new Error('Invalid cloud revision');
        const zone = parts[4].length === 3 ? `${parts[4]}:00` : parts[4];
        return BigInt(Date.parse(`${parts[1]}T${parts[2]}${zone}`)) * 1000n + BigInt((parts[3] ?? '').padEnd(6, '0'));
    };
    const difference = ticks(left) - ticks(right);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};
