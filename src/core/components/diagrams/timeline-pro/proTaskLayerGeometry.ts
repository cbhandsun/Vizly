export const PRO_TASK_ROW_HEIGHT = 42;
export const PRO_TASK_HEADER_HEIGHT = 52;
export const PRO_TASK_BAR_HEIGHT = 28;
export const PRO_TASK_BAR_TOP_MARGIN = (PRO_TASK_ROW_HEIGHT - PRO_TASK_BAR_HEIGHT) / 2;
export const PRO_TASK_CONNECTION_CLICK_THRESHOLD = 6;

const finiteCoordinate = (value: unknown): number | null => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
);

export const isProTaskConnectionClickGesture = (
    startX: unknown,
    startY: unknown,
    endX: unknown,
    endY: unknown,
    threshold: unknown = PRO_TASK_CONNECTION_CLICK_THRESHOLD,
): boolean => {
    const normalizedStartX = finiteCoordinate(startX);
    const normalizedStartY = finiteCoordinate(startY);
    const normalizedEndX = finiteCoordinate(endX);
    const normalizedEndY = finiteCoordinate(endY);
    if (
        normalizedStartX === null
        || normalizedStartY === null
        || normalizedEndX === null
        || normalizedEndY === null
    ) return false;
    const normalizedThreshold = typeof threshold === 'number' && Number.isFinite(threshold)
        ? Math.min(32, Math.max(0, threshold))
        : PRO_TASK_CONNECTION_CLICK_THRESHOLD;
    return Math.hypot(
        normalizedEndX - normalizedStartX,
        normalizedEndY - normalizedStartY,
    ) <= normalizedThreshold;
};

export interface ProTaskDragState {
    taskId: string;
    mode: 'move' | 'resize-right' | 'progress' | 'connect';
    startMouseX: number;
    startMouseY: number;
    origX: number;
    origY?: number;
    origW: number;
    origProgress: number;
    targetTaskId?: string | null;
}

export type ProTaskConnectionPointerRelease =
    | { kind: 'connect'; targetTaskId: string }
    | { kind: 'guide' }
    | { kind: 'cancel' };

export const resolveProTaskConnectionPointerRelease = (
    dragState: Pick<ProTaskDragState, 'startMouseX' | 'startMouseY' | 'targetTaskId' | 'taskId'>,
    endX: unknown,
    endY: unknown,
): ProTaskConnectionPointerRelease => {
    if (dragState.targetTaskId && dragState.targetTaskId !== dragState.taskId) {
        return { kind: 'connect', targetTaskId: dragState.targetTaskId };
    }
    return isProTaskConnectionClickGesture(
        dragState.startMouseX,
        dragState.startMouseY,
        endX,
        endY,
    ) ? { kind: 'guide' } : { kind: 'cancel' };
};
