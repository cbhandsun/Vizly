const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (value: number) => String(value).padStart(2, '0');

export function formatDateOnly(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayDateOnly(): string {
    return formatDateOnly(new Date());
}

export function parseDateOnlyTime(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const trimmed = value.trim();
    const match = DATE_ONLY_RE.exec(trimmed);
    const date = match
        ? (() => {
            const year = Number(match[1]);
            const monthIndex = Number(match[2]) - 1;
            const day = Number(match[3]);
            const candidate = new Date(year, monthIndex, day);

            return candidate.getFullYear() === year
                && candidate.getMonth() === monthIndex
                && candidate.getDate() === day
                ? candidate
                : null;
        })()
        : new Date(trimmed);
    if (!date) {
        return null;
    }
    const time = date.getTime();

    return Number.isFinite(time) ? time : null;
}

export function addDaysToDateOnly(value: unknown, days: number, fallback: string = todayDateOnly()): string {
    const baseTime = parseDateOnlyTime(value) ?? parseDateOnlyTime(fallback);
    const date = Number.isFinite(baseTime) ? new Date(baseTime as number) : new Date();
    date.setDate(date.getDate() + days);
    return formatDateOnly(date);
}
