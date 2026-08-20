export const PRO_TASK_ROW_HEIGHT = 42;
export const PRO_TASK_HEADER_HEIGHT = 52;
export const PRO_TASK_BAR_HEIGHT = 28;
export const PRO_TASK_BAR_TOP_MARGIN = (PRO_TASK_ROW_HEIGHT - PRO_TASK_BAR_HEIGHT) / 2;

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
