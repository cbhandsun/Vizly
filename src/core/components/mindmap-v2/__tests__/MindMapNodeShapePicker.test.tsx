// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MindMapNodeShapePicker } from '../MindMapNodeShapePicker';
import { MIND_MAP_NODE_SHAPE_OPTIONS } from '../mindMapNodeShapeOptions';

const renderPicker = (currentShape?: unknown) => {
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    render(
        <MindMapNodeShapePicker
            currentShape={currentShape}
            onCancel={onCancel}
            onSelect={onSelect}
        />,
    );
    return { onCancel, onSelect };
};

describe('MindMapNodeShapePicker', () => {
    it('opens as a named dialog with readable options and the current shape focused', () => {
        renderPicker('rect');

        const dialog = screen.getByRole('dialog', { name: '节点形状' });
        const options = within(dialog).getAllByRole('radio');
        const selected = screen.getByRole('radio', { name: '节点形状：矩形' });

        expect(options).toHaveLength(MIND_MAP_NODE_SHAPE_OPTIONS.length);
        expect(selected.getAttribute('aria-checked')).toBe('true');
        expect(selected.getAttribute('tabindex')).toBe('0');
        expect(document.activeElement).toBe(selected);
        expect(screen.getByText('结构清晰')).toBeTruthy();
    });

    it('treats absent and unsafe current values as the theme default', () => {
        renderPicker('script');

        const defaultShape = screen.getByRole('radio', { name: '节点形状：默认' });
        expect(defaultShape.getAttribute('aria-checked')).toBe('true');
        expect(document.activeElement).toBe(defaultShape);
    });

    it('supports arrow, Home, End, and Escape keyboard navigation', () => {
        const { onCancel } = renderPicker();
        const first = screen.getByRole('radio', { name: '节点形状：默认' });

        fireEvent.keyDown(first, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('radio', { name: '节点形状：椭圆' }));

        fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
        expect(document.activeElement).toBe(screen.getByRole('radio', { name: '节点形状：菱形' }));

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
                <MindMapNodeShapePicker
                    onCancel={vi.fn()}
                    onSelect={onSelect}
                />
            </div>,
        );
        const oval = screen.getByRole('radio', { name: '节点形状：椭圆' });

        fireEvent.mouseDown(oval);
        fireEvent.click(oval);

        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('oval'));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(parentMouseDown).not.toHaveBeenCalled();
        expect(parentClick).not.toHaveBeenCalled();
    });
});
