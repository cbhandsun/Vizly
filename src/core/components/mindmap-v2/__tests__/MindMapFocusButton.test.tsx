// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { MindElixirInstance } from 'mind-elixir';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const selection = vi.hoisted(() => ({
    current: { id: 'child' } as { id: string } | null,
}));

vi.mock('../useMindMapPropertySelection', () => ({
    useMindMapPropertySelection: () => selection.current,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

import MindMapFocusButton from '../MindMapFocusButton';

const createMind = () => {
    const target = document.createElement('div');
    const focusNode = vi.fn();
    const cancelFocus = vi.fn();
    const selectNode = vi.fn();
    const mind = {
        cancelFocus,
        findEle: vi.fn((nodeId: string) => nodeId === 'child' ? target : null),
        focusNode,
        getData: () => ({ nodeData: { id: 'root' } }),
        selectNode,
    } as unknown as MindElixirInstance;
    return { cancelFocus, focusNode, mind, selectNode, target };
};

describe('MindMapFocusButton commercial keyboard flow', () => {
    const animationFrames: FrameRequestCallback[] = [];

    beforeEach(() => {
        selection.current = { id: 'child' };
        animationFrames.length = 0;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const flushFocusRestore = () => {
        act(() => animationFrames.shift()?.(0));
        act(() => animationFrames.shift()?.(16));
    };

    it('exits with Escape and restores focus to the renamed toolbar trigger', () => {
        const { mind, focusNode, cancelFocus, target } = createMind();
        render(<MindMapFocusButton mind={mind} />);

        const enter = screen.getByRole('button', { name: 'plugins.mindmap.toolbar.enterFocus' });
        fireEvent.click(enter);
        expect(focusNode).toHaveBeenCalledWith(target);

        const exit = screen.getByRole('button', { name: 'plugins.mindmap.toolbar.exitFocus' });
        expect(exit.getAttribute('aria-keyshortcuts')).toBe('Escape');
        exit.focus();
        fireEvent.keyDown(exit, { key: 'Escape' });

        expect(cancelFocus).toHaveBeenCalledTimes(1);
        flushFocusRestore();
        const restored = screen.getByRole('button', { name: 'plugins.mindmap.toolbar.enterFocus' });
        expect(document.activeElement).toBe(restored);
        expect(restored.hasAttribute('aria-keyshortcuts')).toBe(false);
    });

    it('restores focus after pointer exit and does not steal Escape from an editor', () => {
        const { mind, cancelFocus } = createMind();
        render(<MindMapFocusButton mind={mind} />);

        fireEvent.click(screen.getByRole('button', { name: 'plugins.mindmap.toolbar.enterFocus' }));
        const editor = document.createElement('textarea');
        document.body.append(editor);
        editor.focus();
        fireEvent.keyDown(editor, { key: 'Escape' });
        expect(cancelFocus).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'plugins.mindmap.toolbar.exitFocus' }));
        expect(cancelFocus).toHaveBeenCalledTimes(1);
        flushFocusRestore();
        expect(document.activeElement).toBe(
            screen.getByRole('button', { name: 'plugins.mindmap.toolbar.enterFocus' }),
        );
        editor.remove();
    });

    it('returns focus to the restored branch when exiting clears the toolbar selection', () => {
        const { mind, cancelFocus, selectNode, target } = createMind();
        document.body.append(target);
        cancelFocus.mockImplementation(() => {
            selection.current = null;
        });
        render(<MindMapFocusButton mind={mind} />);

        fireEvent.click(screen.getByRole('button', { name: 'plugins.mindmap.toolbar.enterFocus' }));
        const exit = screen.getByRole('button', { name: 'plugins.mindmap.toolbar.exitFocus' });
        fireEvent.keyDown(exit, { key: 'Escape' });
        flushFocusRestore();

        expect((screen.getByRole('button', {
            name: 'plugins.mindmap.toolbar.enterFocus',
        }) as HTMLButtonElement).disabled).toBe(true);
        expect(selectNode).toHaveBeenCalledWith(target);
        expect(target.tabIndex).toBe(-1);
        expect(document.activeElement).toBe(target);
        target.remove();
    });
});
