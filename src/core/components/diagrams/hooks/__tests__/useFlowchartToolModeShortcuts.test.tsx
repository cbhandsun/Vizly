// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { useFlowchartToolModeShortcuts } from '../useFlowchartToolModeShortcuts';
import { useKeyboardShortcuts } from '../../useKeyboardShortcuts';

const useHarness = (
    editingEnabled = true,
    onAddStickyNote?: () => void,
    onAddMindMap?: () => void,
) => {
    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [isMarqueeActive, setIsMarqueeActive] = useState(false);
    const [isCommentMode, setIsCommentMode] = useState(false);
    const actions = useFlowchartToolModeShortcuts({
        editingEnabled,
        isDrawingMode,
        isMarqueeActive,
        isCommentMode,
        setIsDrawingMode,
        setIsMarqueeActive,
        setIsCommentMode,
        onAddStickyNote,
        onAddMindMap,
    });
    return {
        isDrawingMode,
        isMarqueeActive,
        isCommentMode,
        setRawCommentMode: setIsCommentMode,
        ...actions,
    };
};

describe('useFlowchartToolModeShortcuts', () => {
    it('toggles drawing with P and returns to pointer mode with V', () => {
        const { result } = renderHook(() => useHarness());

        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })));
        expect(result.current.isDrawingMode).toBe(true);

        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true })));
        expect(result.current.isDrawingMode).toBe(false);
    });

    it('leaves Escape available to the canonical canvas exit shortcut', () => {
        const onExit = vi.fn();
        const { result } = renderHook(() => {
            const tools = useHarness();
            useKeyboardShortcuts({
                onDelete: vi.fn(),
                onDuplicate: vi.fn(),
                onUndo: vi.fn(),
                onRedo: vi.fn(),
                onSelectAll: vi.fn(),
                onCopy: vi.fn(),
                onPaste: vi.fn(),
                onGroup: vi.fn(),
                onUngroup: vi.fn(),
                onEscapeEdit: () => {
                    onExit();
                    tools.activatePointer();
                },
            });
            return tools;
        });

        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true })));
        expect(result.current.isMarqueeActive).toBe(true);
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

        expect(onExit).toHaveBeenCalledOnce();
        expect(result.current.isMarqueeActive).toBe(false);
    });

    it('keeps drawing, marquee, and comment modes mutually exclusive', () => {
        const { result } = renderHook(() => useHarness());

        act(() => result.current.toggleCommentMode());
        expect(result.current.isCommentMode).toBe(true);
        act(() => result.current.toggleMarqueeMode());
        expect(result.current.isMarqueeActive).toBe(true);
        expect(result.current.isCommentMode).toBe(false);
        act(() => result.current.toggleDrawingMode());
        expect(result.current.isDrawingMode).toBe(true);
        expect(result.current.isMarqueeActive).toBe(false);
        act(() => result.current.setCommentMode(true));
        expect(result.current.isDrawingMode).toBe(false);
        expect(result.current.isCommentMode).toBe(true);
    });

    it('arbitrates externally activated comment mode and supports the advertised shortcuts', () => {
        const addStickyNote = vi.fn();
        const addMindMap = vi.fn();
        const { result } = renderHook(() => useHarness(true, addStickyNote, addMindMap));

        act(() => result.current.toggleDrawingMode());
        act(() => result.current.setRawCommentMode(true));
        expect(result.current.isDrawingMode).toBe(false);
        expect(result.current.isCommentMode).toBe(true);

        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })));
        expect(result.current.isCommentMode).toBe(false);
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true })));
        expect(result.current.isMarqueeActive).toBe(true);
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true })));
        expect(result.current.isMarqueeActive).toBe(false);
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true })));
        expect(addStickyNote).toHaveBeenCalledOnce();
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', shiftKey: true, bubbles: true })));
        expect(addMindMap).toHaveBeenCalledOnce();
    });

    it('does not steal typing focus or enable tools in readonly mode', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        const { result, rerender } = renderHook(({ enabled }) => useHarness(enabled), {
            initialProps: { enabled: true },
        });

        act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })));
        expect(result.current.isDrawingMode).toBe(false);
        act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })));
        expect(result.current.isCommentMode).toBe(false);
        rerender({ enabled: false });
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })));
        expect(result.current.isDrawingMode).toBe(false);
        act(() => result.current.setCommentMode(true));
        expect(result.current.isCommentMode).toBe(false);
        input.remove();
    });

    it('does not activate canvas tools from focused buttons or menu items', () => {
        const addStickyNote = vi.fn();
        const addMindMap = vi.fn();
        const button = document.createElement('button');
        const icon = document.createElement('span');
        button.append(icon);
        const menuItem = document.createElement('div');
        menuItem.setAttribute('role', 'menuitem');
        document.body.append(button, menuItem);
        const { result } = renderHook(() => useHarness(true, addStickyNote, addMindMap));

        act(() => icon.dispatchEvent(new KeyboardEvent('keydown', {
            key: 's',
            bubbles: true,
            cancelable: true,
        })));
        act(() => menuItem.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'm',
            bubbles: true,
            cancelable: true,
        })));
        act(() => button.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'M',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        })));

        expect(addStickyNote).not.toHaveBeenCalled();
        expect(addMindMap).not.toHaveBeenCalled();
        expect(result.current.isMarqueeActive).toBe(false);
        expect(result.current.isDrawingMode).toBe(false);

        button.remove();
        menuItem.remove();
    });

    it('uses the focused control when a browser reports the key event at window level', () => {
        const addStickyNote = vi.fn();
        const button = document.createElement('button');
        document.body.append(button);
        button.focus();
        renderHook(() => useHarness(true, addStickyNote));

        act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
            key: 's',
            bubbles: true,
            cancelable: true,
        })));

        expect(document.activeElement).toBe(button);
        expect(addStickyNote).not.toHaveBeenCalled();
        button.remove();
    });

    it('still activates tool shortcuts from a non-interactive canvas target', () => {
        const addStickyNote = vi.fn();
        const canvas = document.createElement('div');
        document.body.append(canvas);
        const { result } = renderHook(() => useHarness(true, addStickyNote));

        act(() => canvas.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'm',
            bubbles: true,
            cancelable: true,
        })));
        expect(result.current.isMarqueeActive).toBe(true);

        act(() => canvas.dispatchEvent(new KeyboardEvent('keydown', {
            key: 's',
            bubbles: true,
            cancelable: true,
        })));
        expect(addStickyNote).toHaveBeenCalledOnce();
    });
});
