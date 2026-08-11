// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    shouldIgnoreCanvasShortcutForTarget,
    useKeyboardShortcuts,
} from '../useKeyboardShortcuts';

const createProps = () => ({
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSelectAll: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onGroup: vi.fn(),
    onUngroup: vi.fn(),
    onNudge: vi.fn(),
    onEnterEdit: vi.fn(),
    onEscapeEdit: vi.fn(),
});

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('useKeyboardShortcuts interactive target isolation', () => {
    it('recognizes native and semantic controls, including nested icon targets', () => {
        const button = document.createElement('button');
        const icon = document.createElement('span');
        button.append(icon);
        const semanticButton = document.createElement('div');
        semanticButton.setAttribute('role', 'button');
        const canvas = document.createElement('div');
        document.body.append(button, semanticButton, canvas);

        expect(shouldIgnoreCanvasShortcutForTarget(button, false)).toBe(true);
        expect(shouldIgnoreCanvasShortcutForTarget(icon, false)).toBe(true);
        expect(shouldIgnoreCanvasShortcutForTarget(semanticButton, false)).toBe(true);
        expect(shouldIgnoreCanvasShortcutForTarget(canvas, false)).toBe(false);
        expect(shouldIgnoreCanvasShortcutForTarget(null, false)).toBe(false);
    });

    it('leaves Enter, arrows, Delete, and Escape to a focused toolbar button', () => {
        const props = createProps();
        const button = document.createElement('button');
        document.body.append(button);
        renderHook(() => useKeyboardShortcuts(props));

        for (const key of ['Enter', 'ArrowLeft', 'Delete', 'Escape']) {
            act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
        }

        expect(props.onEnterEdit).not.toHaveBeenCalled();
        expect(props.onNudge).not.toHaveBeenCalled();
        expect(props.onDelete).not.toHaveBeenCalled();
        expect(props.onEscapeEdit).not.toHaveBeenCalled();
    });

    it('uses the focused control when a browser reports the key event at window level', () => {
        const props = createProps();
        const button = document.createElement('button');
        document.body.append(button);
        button.focus();
        renderHook(() => useKeyboardShortcuts(props));

        act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
        })));

        expect(document.activeElement).toBe(button);
        expect(props.onEnterEdit).not.toHaveBeenCalled();
    });

    it('keeps explicit global accelerators available from toolbar controls', () => {
        const props = createProps();
        const button = document.createElement('button');
        document.body.append(button);
        renderHook(() => useKeyboardShortcuts(props));

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        act(() => button.dispatchEvent(event));

        expect(props.onUndo).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it('still routes unmodified canvas Enter to node editing', () => {
        const props = createProps();
        const canvas = document.createElement('div');
        document.body.append(canvas);
        renderHook(() => useKeyboardShortcuts(props));

        act(() => canvas.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
        })));

        expect(props.onEnterEdit).toHaveBeenCalledTimes(1);
    });
});
