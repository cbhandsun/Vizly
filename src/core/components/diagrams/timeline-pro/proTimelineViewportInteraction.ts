import type { Node } from '@xyflow/react';
import { parseDateOnlyTime } from '../../../utils/dateOnly';

export const PRO_TIMELINE_MIN_ZOOM = 0.15;
export const PRO_TIMELINE_MAX_ZOOM = 5;
export const PRO_TIMELINE_KEYBOARD_PAN_STEP = 48;
export const PRO_TIMELINE_PAN_CLICK_THRESHOLD = 4;

const TIMELINE_EPOCH = parseDateOnlyTime('2026-01-01')!;
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeProTimelineZoom(value: unknown): number {
    const zoom = typeof value === 'number' && Number.isFinite(value) ? value : 1;
    return Math.min(PRO_TIMELINE_MAX_ZOOM, Math.max(PRO_TIMELINE_MIN_ZOOM, zoom));
}

export function getProTimelineDateX(date: unknown, pixelsPerDay: unknown): number {
    const dateTime = typeof date === 'string' ? parseDateOnlyTime(date) : null;
    const safePixelsPerDay = typeof pixelsPerDay === 'number' && Number.isFinite(pixelsPerDay) && pixelsPerDay > 0
        ? pixelsPerDay
        : 0;
    if (dateTime === null || safePixelsPerDay === 0) return 0;
    return ((dateTime - TIMELINE_EPOCH) / DAY_MS) * safePixelsPerDay;
}

export function getProTimelineZoomedPanX(
    panX: unknown,
    currentZoom: unknown,
    nextZoom: unknown,
    viewportAnchorX: unknown,
): number {
    const safePanX = typeof panX === 'number' && Number.isFinite(panX) ? panX : 0;
    const safeAnchorX = typeof viewportAnchorX === 'number' && Number.isFinite(viewportAnchorX)
        ? viewportAnchorX
        : 0;
    const current = normalizeProTimelineZoom(currentZoom);
    const next = normalizeProTimelineZoom(nextZoom);
    return safeAnchorX - (safeAnchorX - safePanX) * (next / current);
}

export function getProTimelineKeyboardPanDelta(key: unknown): { dx: number; dy: number } | null {
    switch (key) {
        case 'ArrowLeft':
            return { dx: PRO_TIMELINE_KEYBOARD_PAN_STEP, dy: 0 };
        case 'ArrowRight':
            return { dx: -PRO_TIMELINE_KEYBOARD_PAN_STEP, dy: 0 };
        case 'ArrowUp':
            return { dx: 0, dy: PRO_TIMELINE_KEYBOARD_PAN_STEP };
        case 'ArrowDown':
            return { dx: 0, dy: -PRO_TIMELINE_KEYBOARD_PAN_STEP };
        default:
            return null;
    }
}

export function isProTimelineAdditiveSelection(
    controlKey: unknown,
    metaKey: unknown,
): boolean {
    return controlKey === true || metaKey === true;
}

export function updateProTimelineTaskSelection(
    nodes: readonly Node[],
    taskId: unknown,
    additive: unknown,
): Node[] {
    if (typeof taskId !== 'string' || !nodes.some((node) => node.id === taskId)) {
        return [...nodes];
    }
    const useAdditiveSelection = additive === true;
    return nodes.map((node) => {
        const selected = useAdditiveSelection
            ? (node.id === taskId ? !node.selected : Boolean(node.selected))
            : node.id === taskId;
        return Boolean(node.selected) === selected ? node : { ...node, selected };
    });
}

export function isProTimelinePanClick(
    startX: unknown,
    startY: unknown,
    endX: unknown,
    endY: unknown,
): boolean {
    const values = [startX, startY, endX, endY];
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return false;
    return Math.hypot(
        (endX as number) - (startX as number),
        (endY as number) - (startY as number),
    ) <= PRO_TIMELINE_PAN_CLICK_THRESHOLD;
}
