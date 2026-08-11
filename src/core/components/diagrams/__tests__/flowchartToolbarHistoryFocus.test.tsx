// @vitest-environment jsdom

import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlowchartHistoryToolbarControls } from '../FlowchartHistoryToolbarControls';
import {
    resolveFlowchartToolbarHistoryFocusTarget,
    scheduleFlowchartToolbarHistoryFocus,
} from '../flowchartToolbarHistoryFocus';
import { resolveFlowchartToolbarHistoryCount } from '../flowchartToolbarHistoryPresentation';

const installAnimationFrameQueue = () => {
    let nextId = 1;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        const id = nextId;
        nextId += 1;
        frames.set(id, callback);
        return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
        frames.delete(id);
    });

    return {
        flush: () => {
            const pending = [...frames.entries()];
            frames.clear();
            pending.forEach(([, callback]) => callback(0));
        },
        pendingCount: () => frames.size,
    };
};

const createButton = (disabled = false) => {
    const button = document.createElement('button');
    button.disabled = disabled;
    document.body.append(button);
    return button;
};

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('flowchart toolbar history focus', () => {
    it('accepts only positive safe history counts for the visible label', () => {
        expect(resolveFlowchartToolbarHistoryCount(3)).toBe(3);
        expect(resolveFlowchartToolbarHistoryCount(undefined)).toBeNull();
        expect(resolveFlowchartToolbarHistoryCount(0)).toBeNull();
        expect(resolveFlowchartToolbarHistoryCount(-1)).toBeNull();
        expect(resolveFlowchartToolbarHistoryCount(Number.NaN)).toBeNull();
        expect(resolveFlowchartToolbarHistoryCount(Number.POSITIVE_INFINITY)).toBeNull();
        expect(resolveFlowchartToolbarHistoryCount(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    });

    it('keeps focus on the invoked action while it remains available', () => {
        const undo = createButton();
        const redo = createButton(true);
        const history = createButton();

        expect(resolveFlowchartToolbarHistoryFocusTarget('undo', { undo, redo, history })).toBe(undo);
        redo.disabled = false;
        undo.disabled = true;
        expect(resolveFlowchartToolbarHistoryFocusTarget('undo', { undo, redo, history })).toBe(redo);
    });

    it('uses the history entry only when neither history action remains available', () => {
        const undo = createButton(true);
        const redo = createButton(true);
        const history = createButton();

        expect(resolveFlowchartToolbarHistoryFocusTarget('redo', { undo, redo, history })).toBe(history);
        history.disabled = true;
        expect(resolveFlowchartToolbarHistoryFocusTarget('redo', { undo, redo, history })).toBeNull();
        history.remove();
        expect(resolveFlowchartToolbarHistoryFocusTarget('undo', { undo, redo, history })).toBeNull();
    });

    it('moves focus from an exhausted Undo action to the enabled Redo action', () => {
        const frames = installAnimationFrameQueue();
        const undo = createButton();
        const redo = createButton(true);
        undo.focus();

        const request = scheduleFlowchartToolbarHistoryFocus('undo', undo, () => ({
            undo,
            redo,
            history: null,
        }));
        undo.disabled = true;
        redo.disabled = false;

        frames.flush();
        frames.flush();

        expect(request).not.toBeNull();
        expect(document.activeElement).toBe(redo);
    });

    it('does not steal focus after the user moves elsewhere', () => {
        const frames = installAnimationFrameQueue();
        const undo = createButton();
        const redo = createButton();
        const elsewhere = createButton();
        undo.focus();

        scheduleFlowchartToolbarHistoryFocus('undo', undo, () => ({
            undo,
            redo,
            history: null,
        }));
        elsewhere.focus();
        frames.flush();
        frames.flush();

        expect(document.activeElement).toBe(elsewhere);
    });

    it('cancels pending focus work safely', () => {
        const frames = installAnimationFrameQueue();
        const undo = createButton();
        undo.focus();

        const request = scheduleFlowchartToolbarHistoryFocus('undo', undo, () => ({
            undo,
            redo: null,
            history: null,
        }));
        request?.cancel();
        frames.flush();

        expect(frames.pendingCount()).toBe(0);
        expect(document.activeElement).toBe(undo);
    });

    it('closes the keyboard loop across the Undo and Redo boundary states', () => {
        const frames = installAnimationFrameQueue();
        const onUndo = vi.fn();
        const onRedo = vi.fn();
        const Harness = () => {
            const [state, setState] = useState({ canUndo: true, canRedo: false });
            return (
                <FlowchartHistoryToolbarControls
                    canUndo={state.canUndo}
                    canRedo={state.canRedo}
                    onUndo={() => {
                        onUndo();
                        setState({ canUndo: false, canRedo: true });
                    }}
                    onRedo={() => {
                        onRedo();
                        setState({ canUndo: true, canRedo: false });
                    }}
                    undoLabel="Undo"
                    redoLabel="Redo"
                    historyLabel="History"
                    buttonClassName="enabled"
                    disabledButtonClassName="disabled"
                    dividerClassName="divider"
                    showHistory={false}
                />
            );
        };
        render(<Harness />);

        const undo = screen.getByRole('button', { name: 'Undo' });
        fireEvent.click(undo);
        act(() => {
            frames.flush();
            frames.flush();
        });
        const redo = screen.getByRole('button', { name: 'Redo' });
        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(redo);

        fireEvent.click(redo);
        act(() => {
            frames.flush();
            frames.flush();
        });
        expect(onRedo).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(undo);
    });
});
