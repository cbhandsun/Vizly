// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FreehandDrawingLayer } from '../FreehandDrawingLayer';

const installPointerCapture = (element: SVGSVGElement) => {
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn(pointerId => captured.add(pointerId));
    element.hasPointerCapture = vi.fn(pointerId => captured.has(pointerId));
    element.releasePointerCapture = vi.fn(pointerId => captured.delete(pointerId));
};

describe('FreehandDrawingLayer', () => {
    it('commits one bounded stroke on pointer up and exposes drawing instructions', () => {
        const onDrawEnd = vi.fn();
        render(
            <FreehandDrawingLayer isDrawingMode onDrawEnd={onDrawEnd} zoom={2} pan={{ x: 10, y: 20 }} />,
        );
        const canvas = document.querySelector<SVGSVGElement>('svg[role="application"][aria-label="自由画笔画布，按 Esc 退出"]');
        if (!canvas) throw new Error('Expected the freehand drawing canvas');
        installPointerCapture(canvas);
        vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300,
            toJSON: () => ({}),
        });

        fireEvent.pointerDown(canvas, { pointerId: 7, button: 0, clientX: 30, clientY: 40, pressure: 0.5 });
        fireEvent.pointerMove(canvas, { pointerId: 7, buttons: 1, clientX: 50, clientY: 60, pressure: 0.5 });
        fireEvent.pointerUp(canvas, { pointerId: 7 });

        expect(onDrawEnd).toHaveBeenCalledTimes(1);
        expect(onDrawEnd.mock.calls[0][0].points).toEqual([[10, 10, 0.5], [20, 20, 0.5]]);
        expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7);
    });

    it('discards a cancelled pointer and clears an in-flight stroke when mode exits', () => {
        const onDrawEnd = vi.fn();
        const { rerender, queryByRole } = render(
            <FreehandDrawingLayer isDrawingMode onDrawEnd={onDrawEnd} />,
        );
        const canvas = document.querySelector<SVGSVGElement>('svg[role="application"]');
        if (!canvas) throw new Error('Expected the freehand drawing canvas');
        installPointerCapture(canvas);

        fireEvent.pointerDown(canvas, { pointerId: 3, button: 0, clientX: 10, clientY: 10 });
        fireEvent.pointerCancel(canvas, { pointerId: 3 });
        expect(onDrawEnd).not.toHaveBeenCalled();

        fireEvent.pointerDown(canvas, { pointerId: 4, button: 0, clientX: 20, clientY: 20 });
        rerender(<FreehandDrawingLayer key="inactive" isDrawingMode={false} onDrawEnd={onDrawEnd} />);
        expect(queryByRole('application')).toBeNull();
        expect(onDrawEnd).not.toHaveBeenCalled();
    });
});
