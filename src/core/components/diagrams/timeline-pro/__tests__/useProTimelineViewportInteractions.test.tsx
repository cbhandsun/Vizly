// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { useProTimelineViewportInteractions } from '../useProTimelineViewportInteractions';

class PointerEventMock extends MouseEvent {
    readonly isPrimary: boolean;
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.isPrimary = init.isPrimary ?? true;
        this.pointerId = init.pointerId ?? 0;
    }
}

beforeAll(() => {
    vi.stubGlobal('PointerEvent', PointerEventMock);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
});

function ViewportHarness({
    clearSelection,
    setPanByDelta,
}: {
    clearSelection: () => void;
    setPanByDelta: (dx: number, dy: number) => void;
}) {
    const timelineRef = React.useRef<HTMLDivElement>(null);
    const interactions = useProTimelineViewportInteractions({
        clearSelection,
        panX: 0,
        panY: 0,
        setPan: vi.fn(),
        setPanByDelta,
        setZoom: vi.fn(),
        timelineRef,
        zoomLevel: 1,
    });
    return (
        <div
            ref={timelineRef}
            className="pro-timeline-bg"
            data-testid="viewport-harness"
            onPointerDown={interactions.handlePointerDown}
            onPointerMove={interactions.handlePointerMove}
            onPointerUp={interactions.handlePointerUp}
            onPointerCancel={interactions.handlePointerCancel}
            onLostPointerCapture={interactions.handleLostPointerCapture}
        />
    );
}

describe('useProTimelineViewportInteractions', () => {
    it('preserves selection after a canceled pan and clears it only on a click', () => {
        const clearSelection = vi.fn();
        const setPanByDelta = vi.fn();
        render(
            <ViewportHarness
                clearSelection={clearSelection}
                setPanByDelta={setPanByDelta}
            />,
        );
        const viewport = screen.getByTestId('viewport-harness');

        fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
        fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 20, clientY: 15 });
        fireEvent.pointerCancel(viewport, { pointerId: 1, clientX: 20, clientY: 15 });
        fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 20, clientY: 15 });

        expect(setPanByDelta).toHaveBeenCalledWith(10, 5);
        expect(clearSelection).not.toHaveBeenCalled();

        fireEvent.pointerDown(viewport, { pointerId: 2, button: 0, clientX: 30, clientY: 30 });
        fireEvent.pointerUp(viewport, { pointerId: 2, clientX: 32, clientY: 30 });
        expect(clearSelection).toHaveBeenCalledTimes(1);
    });
});
