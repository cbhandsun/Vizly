export const FLOWCHART_MIN_ZOOM_PERCENT = 10;
export const FLOWCHART_MAX_ZOOM_PERCENT = 400;
export const FLOWCHART_RESET_ZOOM_PERCENT = 100;

export interface FlowchartZoomControlState {
    percent?: number;
    zoomInDisabled: boolean;
    zoomOutDisabled: boolean;
    resetDisabled: boolean;
}

const normalizeZoomPercent = (value: unknown): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return undefined;
    }

    return Math.round(value);
};

export const getFlowchartZoomControlState = (
    zoomPercent: unknown,
): FlowchartZoomControlState => {
    const percent = normalizeZoomPercent(zoomPercent);

    return {
        percent,
        zoomInDisabled: percent !== undefined && percent >= FLOWCHART_MAX_ZOOM_PERCENT,
        zoomOutDisabled: percent !== undefined && percent <= FLOWCHART_MIN_ZOOM_PERCENT,
        resetDisabled: percent === FLOWCHART_RESET_ZOOM_PERCENT,
    };
};
