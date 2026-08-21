const UNNAMED_RESOURCE_TASK = '未命名任务';

export const isResourceTaskActivationKey = (value: unknown): boolean => (
    value === 'Enter' || value === ' '
);

export const getResourceTaskAccessibleLabel = (taskName: unknown): string => {
    const normalizedName = typeof taskName === 'string' ? taskName.trim() : '';
    return `查看时间线任务 ${normalizedName || UNNAMED_RESOURCE_TASK}`;
};
