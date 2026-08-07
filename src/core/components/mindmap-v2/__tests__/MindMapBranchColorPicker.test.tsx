// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MindMapBranchColorPicker } from '../MindMapBranchColorPicker';
import { MIND_MAP_BRANCH_COLOR_OPTIONS } from '../mindMapBranchColorOptions';

const renderPicker = (currentColor?: string) => {
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    render(
        <MindMapBranchColorPicker
            currentColor={currentColor}
            onCancel={onCancel}
            onSelect={onSelect}
        />,
    );
    return { onCancel, onSelect };
};

describe('MindMapBranchColorPicker', () => {
    it('opens as a named dialog with human-readable options and the current color focused', () => {
        renderPicker('#ef4444');

        const dialog = screen.getByRole('dialog', { name: '连线颜色' });
        const options = within(dialog).getAllByRole('radio');
        const selected = screen.getByRole('radio', { name: '连线颜色：红色（#ef4444）' });

        expect(options).toHaveLength(MIND_MAP_BRANCH_COLOR_OPTIONS.length);
        expect(selected.getAttribute('aria-checked')).toBe('true');
        expect(selected.getAttribute('tabindex')).toBe('0');
        expect(document.activeElement).toBe(selected);
        expect(screen.getByRole('radio', { name: '连线颜色：继承主题' })).toBeTruthy();
    });

    it('treats an absent or unsafe current color as inheriting the theme', () => {
        renderPicker('url(javascript:alert(1))');

        const inherited = screen.getByRole('radio', { name: '连线颜色：继承主题' });
        expect(inherited.getAttribute('aria-checked')).toBe('true');
        expect(document.activeElement).toBe(inherited);
    });

    it('supports arrow, Home, End, and Escape keyboard navigation', () => {
        const { onCancel } = renderPicker('#6366f1');
        const first = screen.getByRole('radio', { name: '连线颜色：靛蓝（#6366f1）' });

        fireEvent.keyDown(first, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('radio', { name: '连线颜色：紫色（#8b5cf6）' }));

        fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
        expect(document.activeElement).toBe(screen.getByRole('radio', { name: '连线颜色：继承主题' }));

        fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
        expect(document.activeElement).toBe(first);

        fireEvent.keyDown(first, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('contains canvas events and applies a pointer selection once', async () => {
        const parentMouseDown = vi.fn();
        const parentClick = vi.fn();
        const onSelect = vi.fn(async () => undefined);
        render(
            <div onMouseDown={parentMouseDown} onClick={parentClick}>
                <MindMapBranchColorPicker
                    onCancel={vi.fn()}
                    onSelect={onSelect}
                />
            </div>,
        );
        const red = screen.getByRole('radio', { name: '连线颜色：红色（#ef4444）' });

        fireEvent.mouseDown(red);
        fireEvent.click(red);

        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('#ef4444'));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(parentMouseDown).not.toHaveBeenCalled();
        expect(parentClick).not.toHaveBeenCalled();
    });
});
