// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayerManagementPanel } from '../LayerManagementPanel';

const layer = {
    id: 'layer-0',
    name: '默认图层',
    visible: true,
    locked: false,
    zIndex: 0,
};

const reviewLayer = {
    id: 'layer-review',
    name: '评审图层',
    visible: true,
    locked: false,
    zIndex: 1,
};

describe('LayerManagementPanel', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('provides keyboard-selectable layers and touch-sized action controls', () => {
        const onSetActive = vi.fn();
        const onToggleVisibility = vi.fn();

        render(
            <LayerManagementPanel
                layers={[layer]}
                activeLayerId="layer-0"
                onSetActive={onSetActive}
                onToggleVisibility={onToggleVisibility}
                onToggleLock={vi.fn()}
                onRename={vi.fn()}
                onCreate={vi.fn()}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
                onSetColor={vi.fn()}
            />,
        );

        const layerItem = screen.getByRole('listitem');
        expect(layerItem.getAttribute('tabindex')).toBe('0');
        expect(layerItem.getAttribute('aria-current')).toBe('true');

        fireEvent.keyDown(layerItem, { key: 'Enter' });
        expect(onSetActive).toHaveBeenCalledWith('layer-0');

        const visibilityButton = screen.getByRole('button', { name: '隐藏图层：默认图层' });
        expect(Number.parseFloat(visibilityButton.style.minWidth)).toBeGreaterThanOrEqual(44);
        expect(visibilityButton.style.width).toBe(visibilityButton.style.minWidth);
        expect(visibilityButton.style.height).toBe(visibilityButton.style.minWidth);
        fireEvent.click(visibilityButton);
        expect(onToggleVisibility).toHaveBeenCalledWith('layer-0');
        expect(onSetActive).toHaveBeenCalledTimes(1);
    });

    it('creates a normalized layer name without relying on a browser prompt', () => {
        const onCreate = vi.fn();
        const promptSpy = vi.spyOn(window, 'prompt');

        render(
            <LayerManagementPanel
                layers={[layer]}
                activeLayerId={null}
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={vi.fn()}
                onCreate={onCreate}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '新建图层' }));
        fireEvent.change(screen.getByRole('textbox', { name: '新图层名称' }), {
            target: { value: '  评审\u0000  图层  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: '创建图层' }));

        expect(promptSpy).not.toHaveBeenCalled();
        expect(onCreate).toHaveBeenCalledWith('评审 图层');
        expect(screen.queryByRole('textbox', { name: '新图层名称' })).toBeNull();
    });

    it('keeps the creation form open for empty input and allows cancellation', () => {
        const onCreate = vi.fn();

        render(
            <LayerManagementPanel
                layers={[layer]}
                activeLayerId={null}
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={vi.fn()}
                onCreate={onCreate}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '新建图层' }));
        fireEvent.change(screen.getByRole('textbox', { name: '新图层名称' }), {
            target: { value: '   ' },
        });
        fireEvent.click(screen.getByRole('button', { name: '创建图层' }));

        const input = screen.getByRole('textbox', { name: '新图层名称' });
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('请输入图层名称');
        expect(input.getAttribute('aria-describedby')).toBe(alert.id);
        expect(document.activeElement).toBe(input);
        expect(onCreate).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '取消新建图层' }));
        expect(screen.queryByRole('textbox', { name: '新图层名称' })).toBeNull();
    });

    it('names the rename input and cancels only the edit when Escape is pressed', () => {
        const onRename = vi.fn();

        render(
            <LayerManagementPanel
                layers={[layer, reviewLayer]}
                activeLayerId="layer-review"
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={onRename}
                onCreate={vi.fn()}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '重命名图层：评审图层' }));
        const input = screen.getByRole('textbox', { name: '重命名图层：评审图层' });
        expect(input.getAttribute('maxlength')).toBe('80');

        fireEvent.keyDown(input, { key: 'Escape' });

        expect(onRename).not.toHaveBeenCalled();
        expect(screen.queryByRole('textbox', { name: '重命名图层：评审图层' })).toBeNull();
        expect(screen.getByText('评审图层')).toBeTruthy();
    });

    it('uses a named dialog before deleting a non-default layer', async () => {
        const onDelete = vi.fn();

        render(
            <LayerManagementPanel
                layers={[layer, reviewLayer]}
                activeLayerId="layer-review"
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={vi.fn()}
                onCreate={vi.fn()}
                onDelete={onDelete}
                onReorder={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '删除图层：评审图层' }));

        const dialog = await screen.findByRole('dialog', { name: '删除图层“评审图层”？' });
        expect(dialog.closest('.ant-modal-wrap')?.getAttribute('style')).toContain('z-index: 1100');
        expect(onDelete).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '确认删除图层' }));
        expect(onDelete).toHaveBeenCalledWith('layer-review');
    });
});
