export const PRO_TASK_PROGRESS_STEP = 5;
export const PRO_TASK_FAST_STEP = 5;

export const getProTaskDependencyControlLeft = (
    type: unknown,
    x: unknown,
    width: unknown,
): number => {
    const safeX = typeof x === 'number' && Number.isFinite(x) ? x : 0;
    const safeWidth = typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : 0;
    if (type === 'milestone') return Math.max(0, safeX - 42);
    return safeX + Math.max(type === 'event' ? 184 : 8, safeWidth) + 4;
};

export const getProTaskLayerAccessibleName = (value: unknown): string => {
    if (typeof value !== 'string') return '未命名任务';
    const trimmed = value.trim();
    return trimmed || '未命名任务';
};

export const getProTaskDateKeyboardDelta = (
    key: unknown,
    shiftKey = false,
): number | null => {
    const step = shiftKey ? PRO_TASK_FAST_STEP : 1;
    if (key === 'ArrowLeft') return -step;
    if (key === 'ArrowRight') return step;
    return null;
};

export const getProTaskProgressKeyboardValue = (
    current: unknown,
    key: unknown,
    shiftKey = false,
): number | null => {
    const numeric = typeof current === 'number' && Number.isFinite(current) ? current : 0;
    const normalized = Math.min(100, Math.max(0, Math.round(numeric)));
    const step = shiftKey ? PRO_TASK_PROGRESS_STEP * 2 : PRO_TASK_PROGRESS_STEP;
    switch (key) {
        case 'ArrowLeft':
        case 'ArrowDown':
            return Math.max(0, normalized - step);
        case 'ArrowRight':
        case 'ArrowUp':
            return Math.min(100, normalized + step);
        case 'Home':
            return 0;
        case 'End':
            return 100;
        default:
            return null;
    }
};
