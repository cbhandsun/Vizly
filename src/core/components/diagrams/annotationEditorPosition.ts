export interface AnnotationEditorViewport {
    width: number;
    height: number;
}

export interface AnnotationEditorPoint {
    x: number;
    y: number;
}

export interface AnnotationEditorSize {
    maxWidth?: number;
    estimatedHeight?: number;
}

const VIEWPORT_MARGIN = 12;
const EDITOR_MAX_WIDTH = 280;
const EDITOR_ESTIMATED_HEIGHT = 176;
const MOBILE_BOTTOM_RESERVE = 152;
const DESKTOP_BOTTOM_RESERVE = 24;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export const resolveAnnotationEditorPosition = (
    point: AnnotationEditorPoint,
    viewport: AnnotationEditorViewport,
    size: AnnotationEditorSize = {},
): AnnotationEditorPoint => {
    const safeWidth = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 320;
    const safeHeight = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 568;
    const requestedWidth = Number.isFinite(size.maxWidth) && Number(size.maxWidth) > 0
        ? Number(size.maxWidth)
        : EDITOR_MAX_WIDTH;
    const requestedHeight = Number.isFinite(size.estimatedHeight) && Number(size.estimatedHeight) > 0
        ? Number(size.estimatedHeight)
        : EDITOR_ESTIMATED_HEIGHT;
    const editorWidth = Math.min(requestedWidth, safeWidth - (VIEWPORT_MARGIN * 2));
    const bottomReserve = safeWidth <= 768 ? MOBILE_BOTTOM_RESERVE : DESKTOP_BOTTOM_RESERVE;
    return {
        x: clamp(point.x - 8, VIEWPORT_MARGIN, safeWidth - editorWidth - VIEWPORT_MARGIN),
        y: clamp(
            point.y - 8,
            VIEWPORT_MARGIN,
            safeHeight - bottomReserve - requestedHeight,
        ),
    };
};
