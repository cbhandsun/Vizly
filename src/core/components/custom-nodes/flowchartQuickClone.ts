export type FlowchartQuickCloneDirection = 'top' | 'right' | 'bottom' | 'left';

const QUICK_CLONE_LABEL_KEYS: Readonly<Record<string, string>> = {
    rectangle: 'designer.flowchart.quickCloneLabels.process',
    pill: 'designer.flowchart.quickCloneLabels.startEnd',
    diamond: 'designer.flowchart.quickCloneLabels.decision',
    parallelogram: 'designer.flowchart.quickCloneLabels.io',
    database: 'designer.flowchart.quickCloneLabels.database',
    'predefined-process': 'designer.flowchart.quickCloneLabels.subProcess',
    document: 'designer.flowchart.quickCloneLabels.document',
    'multi-document': 'designer.flowchart.quickCloneLabels.multiDocument',
    note: 'designer.flowchart.quickCloneLabels.note',
    ellipse: 'designer.flowchart.quickCloneLabels.ellipse',
    circle: 'designer.flowchart.quickCloneLabels.circle',
    triangle: 'designer.flowchart.quickCloneLabels.triangle',
    hexagon: 'designer.flowchart.quickCloneLabels.hexagon',
    trapezoid: 'designer.flowchart.quickCloneLabels.trapezoid',
    star: 'designer.flowchart.quickCloneLabels.star',
    cloud: 'designer.flowchart.quickCloneLabels.cloud',
    'manual-input': 'designer.flowchart.quickCloneLabels.manualInput',
    delay: 'designer.flowchart.quickCloneLabels.delay',
    display: 'designer.flowchart.quickCloneLabels.display',
    'off-page': 'designer.flowchart.quickCloneLabels.offPage',
    'internal-storage': 'designer.flowchart.quickCloneLabels.storage',
};

export const resolveFlowchartQuickCloneLabelKey = (shape: unknown): string => (
    typeof shape === 'string' && QUICK_CLONE_LABEL_KEYS[shape]
        ? QUICK_CLONE_LABEL_KEYS[shape]
        : QUICK_CLONE_LABEL_KEYS.rectangle
);

interface QuickCloneViewportInput {
    containerWidth: number;
    containerHeight: number;
    visibleLeft: number;
    visibleRight: number;
    nodeX: number;
    nodeY: number;
    nodeWidth: number;
    nodeHeight: number;
    viewportX: number;
    viewportY: number;
    zoom: number;
    margin?: number;
}

export interface QuickCloneViewportAdjustment {
    x: number;
    y: number;
    zoom: number;
}

interface CanvasVisibleRightInput {
    containerLeft: number;
    containerRight: number;
    containerWidth: number;
    sidebarLeft?: number;
    sidebarRight?: number;
    sidebarWidth?: number;
    sidebarHeight?: number;
    sidebarVisible: boolean;
}

interface CanvasVisibleLeftInput {
    containerLeft: number;
    containerRight: number;
    containerWidth: number;
    drawerLeft?: number;
    drawerRight?: number;
    drawerWidth?: number;
    drawerHeight?: number;
    drawerVisible: boolean;
}

const clamp = (value: number, min: number, max: number): number => (
    Math.min(Math.max(value, min), max)
);

export const calculateCanvasVisibleRight = (input: CanvasVisibleRightInput): number => {
    if (
        !Number.isFinite(input.containerLeft)
        || !Number.isFinite(input.containerRight)
        || !Number.isFinite(input.containerWidth)
        || input.containerWidth <= 0
        || input.containerRight <= input.containerLeft
    ) {
        return 0;
    }

    const sidebarValues = [
        input.sidebarLeft,
        input.sidebarRight,
        input.sidebarWidth,
        input.sidebarHeight,
    ];
    const sidebarOccludesCanvas = (
        input.sidebarVisible
        && sidebarValues.every(value => typeof value === 'number' && Number.isFinite(value))
        && (input.sidebarWidth ?? 0) > 0
        && (input.sidebarHeight ?? 0) > 0
        && (input.sidebarLeft ?? input.containerRight) < input.containerRight
        && (input.sidebarRight ?? input.containerLeft) > input.containerLeft
    );

    return sidebarOccludesCanvas
        ? clamp(
            (input.sidebarLeft ?? input.containerRight) - input.containerLeft,
            0,
            input.containerWidth,
        )
        : input.containerWidth;
};

export const calculateCanvasVisibleLeft = (input: CanvasVisibleLeftInput): number => {
    if (
        !Number.isFinite(input.containerLeft)
        || !Number.isFinite(input.containerRight)
        || !Number.isFinite(input.containerWidth)
        || input.containerWidth <= 0
        || input.containerRight <= input.containerLeft
    ) {
        return 0;
    }

    const drawerValues = [
        input.drawerLeft,
        input.drawerRight,
        input.drawerWidth,
        input.drawerHeight,
    ];
    const drawerOccludesCanvas = (
        input.drawerVisible
        && drawerValues.every(value => typeof value === 'number' && Number.isFinite(value))
        && (input.drawerWidth ?? 0) > 0
        && (input.drawerHeight ?? 0) > 0
        && (input.drawerLeft ?? input.containerRight) < input.containerRight
        && (input.drawerRight ?? input.containerLeft) > input.containerLeft
    );

    return drawerOccludesCanvas
        ? clamp(
            (input.drawerRight ?? input.containerLeft) - input.containerLeft,
            0,
            input.containerWidth,
        )
        : 0;
};

export const calculateQuickCloneViewportAdjustment = (
    input: QuickCloneViewportInput,
): QuickCloneViewportAdjustment | null => {
    const values = [
        input.containerWidth,
        input.containerHeight,
        input.visibleLeft,
        input.visibleRight,
        input.nodeX,
        input.nodeY,
        input.nodeWidth,
        input.nodeHeight,
        input.viewportX,
        input.viewportY,
        input.zoom,
        input.margin ?? 80,
    ];

    if (
        values.some(value => !Number.isFinite(value))
        || input.containerWidth <= 0
        || input.containerHeight <= 0
        || input.nodeWidth <= 0
        || input.nodeHeight <= 0
        || input.zoom <= 0
    ) {
        return null;
    }

    const visibleLeft = clamp(input.visibleLeft, 0, input.containerWidth);
    const visibleRight = clamp(input.visibleRight, visibleLeft, input.containerWidth);
    if (visibleRight <= visibleLeft) return null;

    const horizontalMargin = clamp(
        Math.max(0, input.margin ?? 80),
        0,
        (visibleRight - visibleLeft) / 2,
    );
    const verticalMargin = clamp(
        Math.max(0, input.margin ?? 80),
        0,
        input.containerHeight / 2,
    );

    const screenLeft = input.nodeX * input.zoom + input.viewportX;
    const screenRight = (input.nodeX + input.nodeWidth) * input.zoom + input.viewportX;
    const screenTop = input.nodeY * input.zoom + input.viewportY;
    const screenBottom = (input.nodeY + input.nodeHeight) * input.zoom + input.viewportY;
    const horizontalOutOfView = (
        screenLeft < visibleLeft + horizontalMargin
        || screenRight > visibleRight - horizontalMargin
    );
    const verticalOutOfView = (
        screenTop < verticalMargin
        || screenBottom > input.containerHeight - verticalMargin
    );

    if (!horizontalOutOfView && !verticalOutOfView) return null;

    const screenCenterX = (screenLeft + screenRight) / 2;
    const screenCenterY = (screenTop + screenBottom) / 2;
    const targetCenterX = (visibleLeft + visibleRight) / 2;
    const targetCenterY = input.containerHeight / 2;

    return {
        x: horizontalOutOfView
            ? input.viewportX + targetCenterX - screenCenterX
            : input.viewportX,
        y: verticalOutOfView
            ? input.viewportY + targetCenterY - screenCenterY
            : input.viewportY,
        zoom: input.zoom,
    };
};
