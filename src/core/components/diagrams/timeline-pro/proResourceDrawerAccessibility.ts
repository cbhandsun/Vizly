const RESOURCE_DRAWER_MOBILE_MAX_WIDTH = 768;
const UNNAMED_RESOURCE_TASK = '未命名任务';

export const isResourceTaskActivationKey = (value: unknown): boolean => (
    value === 'Enter' || value === ' '
);

export const shouldCloseResourceDrawerAfterFocus = (viewportWidth: unknown): boolean => (
    typeof viewportWidth === 'number'
    && Number.isFinite(viewportWidth)
    && viewportWidth > 0
    && viewportWidth <= RESOURCE_DRAWER_MOBILE_MAX_WIDTH
);

export const getResourceTaskAccessibleLabel = (taskName: unknown): string => {
    const normalizedName = typeof taskName === 'string' ? taskName.trim() : '';
    return `查看时间线任务 ${normalizedName || UNNAMED_RESOURCE_TASK}`;
};
