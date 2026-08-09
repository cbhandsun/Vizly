export interface ProTimelineDependencyViewportAnchor {
    left: number;
    top: number;
}

const finiteOr = (value: unknown, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const clamp = (value: number, min: number, max: number): number => (
    Math.min(Math.max(value, min), Math.max(min, max))
);

export function getProTimelineDependencyViewportAnchor(
    rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
    viewportWidth: unknown,
    viewportHeight: unknown,
): ProTimelineDependencyViewportAnchor {
    const width = Math.max(320, finiteOr(viewportWidth, 1280));
    const height = Math.max(320, finiteOr(viewportHeight, 720));
    const rectLeft = finiteOr(rect.left, width / 2);
    const rectTop = finiteOr(rect.top, height / 2);
    const rectWidth = Math.max(0, finiteOr(rect.width, 0));
    const rectHeight = Math.max(0, finiteOr(rect.height, 0));
    const toolbarWidth = Math.min(360, width - 24);
    const horizontalInset = toolbarWidth / 2 + 12;

    return {
        left: clamp(rectLeft + rectWidth / 2, horizontalInset, width - horizontalInset),
        top: clamp(rectTop + rectHeight + 12, 12, height - 260),
    };
}

export function getProTimelineDependencyTaskName(value: unknown): string {
    if (typeof value !== 'string') return '未命名任务';
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized || '未命名任务';
}

export function getProTimelineDependencyAccessibleName(
    sourceName: unknown,
    targetName: unknown,
): string {
    return `依赖：${getProTimelineDependencyTaskName(sourceName)} → ${getProTimelineDependencyTaskName(targetName)}`;
}

export function isProTimelineDependencyActivationKey(key: unknown): boolean {
    return key === 'Enter' || key === ' ';
}

export function isProTimelineDependencyDeleteKey(key: unknown): boolean {
    return key === 'Delete' || key === 'Backspace';
}
