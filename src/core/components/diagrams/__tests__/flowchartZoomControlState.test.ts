import { describe, expect, it } from 'vitest';
import {
    FLOWCHART_MAX_ZOOM_PERCENT,
    FLOWCHART_MIN_ZOOM_PERCENT,
    getFlowchartZoomControlState,
} from '../flowchartZoomControlState';

describe('getFlowchartZoomControlState', () => {
    it('keeps ordinary zoom controls available away from boundaries', () => {
        expect(getFlowchartZoomControlState(120)).toEqual({
            percent: 120,
            zoomInDisabled: false,
            zoomOutDisabled: false,
            resetDisabled: false,
        });
    });

    it('disables only the control that cannot change the zoom at each limit', () => {
        expect(getFlowchartZoomControlState(FLOWCHART_MIN_ZOOM_PERCENT)).toMatchObject({
            zoomInDisabled: false,
            zoomOutDisabled: true,
            resetDisabled: false,
        });
        expect(getFlowchartZoomControlState(FLOWCHART_MAX_ZOOM_PERCENT)).toMatchObject({
            zoomInDisabled: true,
            zoomOutDisabled: false,
            resetDisabled: false,
        });
    });

    it('disables a no-op reset when the displayed zoom is already 100%', () => {
        expect(getFlowchartZoomControlState(99.6)).toMatchObject({
            percent: 100,
            resetDisabled: true,
        });
    });

    it.each([undefined, null, '', Number.NaN, Number.POSITIVE_INFINITY, 0, -10])(
        'keeps recovery actions available for invalid input %s',
        (value) => {
            expect(getFlowchartZoomControlState(value)).toEqual({
                percent: undefined,
                zoomInDisabled: false,
                zoomOutDisabled: false,
                resetDisabled: false,
            });
        },
    );

    it('fails safe for extreme but finite zoom values', () => {
        expect(getFlowchartZoomControlState(10_000)).toMatchObject({
            percent: 10_000,
            zoomInDisabled: true,
            zoomOutDisabled: false,
        });
    });
});
