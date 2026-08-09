export const PRO_TASK_LIST_MIN_WIDTH = 280;
export const PRO_TASK_LIST_MAX_WIDTH = 650;
export const PRO_TASK_LIST_DEFAULT_WIDTH = 380;
export const PRO_TASK_LIST_WIDTH_STEP = 20;

export const normalizeProTaskListWidth = (value: unknown): number => {
    const candidate = typeof value === 'number' && Number.isFinite(value)
        ? value
        : PRO_TASK_LIST_DEFAULT_WIDTH;
    return Math.min(PRO_TASK_LIST_MAX_WIDTH, Math.max(PRO_TASK_LIST_MIN_WIDTH, candidate));
};

export const getProTaskListKeyboardWidth = (
    current: unknown,
    key: unknown,
): number | null => {
    const width = normalizeProTaskListWidth(current);
    switch (key) {
        case 'ArrowLeft':
            return normalizeProTaskListWidth(width - PRO_TASK_LIST_WIDTH_STEP);
        case 'ArrowRight':
            return normalizeProTaskListWidth(width + PRO_TASK_LIST_WIDTH_STEP);
        case 'Home':
            return PRO_TASK_LIST_MIN_WIDTH;
        case 'End':
            return PRO_TASK_LIST_MAX_WIDTH;
        default:
            return null;
    }
};

export const getProTaskAccessibleName = (value: unknown): string => {
    if (typeof value !== 'string') return '未命名任务';
    const trimmed = value.trim();
    return trimmed || '未命名任务';
};
