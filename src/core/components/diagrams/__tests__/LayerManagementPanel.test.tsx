// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import React, { useState } from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerManagementPanel } from '../LayerManagementPanel';
import en from '../../../../locales/en.json';
import i18n from '../../../../i18n';

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

class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());

describe('LayerManagementPanel', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh');
    });

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

    it('uses roving layer focus and arrow keys without tabbing through inactive actions', async () => {
        const onSetActive = vi.fn();

        render(
            <LayerManagementPanel
                layers={[layer, reviewLayer]}
                activeLayerId="layer-review"
                onSetActive={onSetActive}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={vi.fn()}
                onCreate={vi.fn()}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
                onSetColor={vi.fn()}
            />,
        );

        const rows = screen.getAllByRole('listitem');
        const reviewRow = rows.find(row => row.textContent?.includes('评审图层'));
        const defaultRow = rows.find(row => row.textContent?.includes('默认图层'));

        expect(reviewRow?.getAttribute('tabindex')).toBe('0');
        expect(defaultRow?.getAttribute('tabindex')).toBe('-1');
        expect(screen.getByRole('button', { name: '隐藏图层：默认图层' }).getAttribute('tabindex')).toBe('-1');

        reviewRow?.focus();
        fireEvent.keyDown(reviewRow as HTMLElement, { key: 'ArrowDown' });

        expect(onSetActive).toHaveBeenCalledWith('layer-0');
        await waitFor(() => expect(document.activeElement).toBe(defaultRow));
    });

    it('exposes working layer-order controls only for the active layer', () => {
        const onReorder = vi.fn();

        render(
            <LayerManagementPanel
                layers={[layer, reviewLayer]}
                activeLayerId="layer-review"
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={vi.fn()}
                onCreate={vi.fn()}
                onDelete={vi.fn()}
                onReorder={onReorder}
                onSetColor={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: '上移图层：评审图层' }).hasAttribute('disabled')).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: '下移图层：评审图层' }));
        expect(onReorder).toHaveBeenCalledWith(1, 0);
        expect(screen.queryByRole('button', { name: '上移图层：默认图层' })).toBeNull();
    });

    it('uses one-tab-stop radio semantics and readable names for layer colors', async () => {
        const LayerColorHarness = () => {
            const [color, setColor] = useState<string | undefined>();
            return (
                <LayerManagementPanel
                    layers={[{ ...layer, color }]}
                    activeLayerId="layer-0"
                    onSetActive={vi.fn()}
                    onToggleVisibility={vi.fn()}
                    onToggleLock={vi.fn()}
                    onRename={vi.fn()}
                    onCreate={vi.fn()}
                    onDelete={vi.fn()}
                    onReorder={vi.fn()}
                    onSetColor={(_layerId, nextColor) => setColor(nextColor)}
                />
            );
        };

        render(<LayerColorHarness />);
        fireEvent.click(screen.getByRole('button', { name: '设置图层颜色：默认图层' }));

        const radios = await screen.findAllByRole('radio');
        const noColor = screen.getByRole('radio', { name: '图层颜色：无颜色' });
        expect(radios).toHaveLength(13);
        expect(radios.filter(radio => radio.getAttribute('tabindex') === '0')).toHaveLength(1);
        expect(noColor.getAttribute('aria-checked')).toBe('true');

        noColor.focus();
        fireEvent.keyDown(noColor, { key: 'ArrowRight' });
        const red = screen.getByRole('radio', { name: '图层颜色：红色' });
        await waitFor(() => {
            expect(red.getAttribute('aria-checked')).toBe('true');
            expect(document.activeElement).toBe(red);
        });
        expect(screen.getAllByRole('radio').filter(radio => radio.getAttribute('tabindex') === '0')).toHaveLength(1);
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

        const createTrigger = screen.getByRole('button', { name: '新建图层' });
        fireEvent.click(createTrigger);
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
        expect(input.getAttribute('data-preserve-drawer-on-escape')).toBe('true');

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByRole('textbox', { name: '新图层名称' })).toBeNull();
        return waitFor(() => {
            expect(document.activeElement).toBe(screen.getByRole('button', { name: '新建图层' }));
        });
    });

    it('uses responsive creation and wrapping action layouts on narrow screens', () => {
        render(
            <LayerManagementPanel
                layers={[layer, reviewLayer]}
                activeLayerId="layer-review"
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={vi.fn()}
                onCreate={vi.fn()}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
                onSetColor={vi.fn()}
            />,
        );

        const deleteButton = screen.getByRole('button', { name: '删除图层：评审图层' });
        expect(deleteButton.closest('.layer-management-panel__actions')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: '新建图层' }));
        const input = screen.getByRole('textbox', { name: '新图层名称' });
        expect(input.closest('.layer-management-panel__create-controls')).toBeTruthy();

        const css = readFileSync('src/core/components/diagrams/LayerManagementPanel.css', 'utf8');
        expect(css).toMatch(
            /\.layer-management-panel__actions\s*\{[^}]*width:\s*100%;[^}]*flex-wrap:\s*wrap;/s,
        );
        expect(css).toMatch(
            /@media \(max-width: 768px\)[\s\S]*?\.layer-management-panel__create-controls\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
        );
        expect(css).toMatch(
            /\.layer-management-panel__create-input\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*width:\s*100%;/s,
        );
    });

    it('keeps duplicate layer creation in place with an associated error', () => {
        const onCreate = vi.fn(() => true);

        render(
            <LayerManagementPanel
                layers={[layer, reviewLayer]}
                activeLayerId="layer-review"
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={vi.fn(() => true)}
                onCreate={onCreate}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '新建图层' }));
        fireEvent.change(screen.getByRole('textbox', { name: '新图层名称' }), {
            target: { value: '  评审\u200B图层  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: '创建图层' }));

        const input = screen.getByRole('textbox', { name: '新图层名称' });
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('图层名称不能重复');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe(alert.id);
        expect(document.activeElement).toBe(input);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('keeps duplicate rename validation editable', () => {
        const onRename = vi.fn(() => true);

        render(
            <LayerManagementPanel
                layers={[layer, reviewLayer]}
                activeLayerId="layer-review"
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={onRename}
                onCreate={vi.fn(() => true)}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '重命名图层：评审图层' }));
        const input = screen.getByRole('textbox', { name: '重命名图层：评审图层' });

        fireEvent.change(input, { target: { value: '默认图层' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('图层名称不能重复');
        expect(input.getAttribute('aria-describedby')).toBe(alert.id);
        expect(onRename).not.toHaveBeenCalled();
    });

    it('keeps host-rejected renames editable with a retry message', () => {
        const onRename = vi.fn(() => false);

        render(
            <LayerManagementPanel
                layers={[layer, reviewLayer]}
                activeLayerId="layer-review"
                onSetActive={vi.fn()}
                onToggleVisibility={vi.fn()}
                onToggleLock={vi.fn()}
                onRename={onRename}
                onCreate={vi.fn(() => true)}
                onDelete={vi.fn()}
                onReorder={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '重命名图层：评审图层' }));
        const input = screen.getByRole('textbox', { name: '重命名图层：评审图层' });

        fireEvent.change(input, { target: { value: '已校验的新名称' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('图层重命名失败，请重试');
        expect(onRename).toHaveBeenCalledWith('layer-review', '已校验的新名称');
        expect(screen.getByRole('textbox', { name: '重命名图层：评审图层' })).toBe(input);
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

    it('localizes layer controls, validation, colors, and deletion in English', async () => {
        const englishI18n = createInstance();
        await englishI18n.init({
            lng: 'en',
            fallbackLng: 'en',
            resources: { en: { translation: en } },
        });

        const { unmount } = render(
            <I18nextProvider i18n={englishI18n}>
                <LayerManagementPanel
                    layers={[layer, reviewLayer]}
                    activeLayerId="layer-review"
                    onSetActive={vi.fn()}
                    onToggleVisibility={vi.fn()}
                    onToggleLock={vi.fn()}
                    onRename={vi.fn()}
                    onCreate={vi.fn()}
                    onDelete={vi.fn()}
                    onReorder={vi.fn()}
                    onSetColor={vi.fn()}
                />
            </I18nextProvider>,
        );

        expect(screen.getByRole('heading', { name: 'Layers' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Hide layer: 评审图层' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Lock layer: 评审图层' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Set layer color: 评审图层' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'New layer' }));
        const createInput = screen.getByRole('textbox', { name: 'New layer name' });
        expect(createInput.getAttribute('placeholder')).toBe('Enter a layer name');
        fireEvent.click(screen.getByRole('button', { name: 'Create layer' }));
        expect(screen.getByRole('alert').textContent).toContain('Enter a layer name');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel new layer' }));

        fireEvent.click(screen.getByRole('button', { name: 'Set layer color: 评审图层' }));
        expect(await screen.findByRole('radiogroup', { name: 'Layer colors' })).toBeTruthy();
        expect(screen.getByRole('radio', { name: 'Layer color: Red' })).toBeTruthy();
        unmount();

        render(
            <I18nextProvider i18n={englishI18n}>
                <LayerManagementPanel
                    layers={[layer, reviewLayer]}
                    activeLayerId="layer-review"
                    onSetActive={vi.fn()}
                    onToggleVisibility={vi.fn()}
                    onToggleLock={vi.fn()}
                    onRename={vi.fn()}
                    onCreate={vi.fn()}
                    onDelete={vi.fn()}
                    onReorder={vi.fn()}
                />
            </I18nextProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete layer: 评审图层' }));
        expect(await screen.findByRole('dialog', { name: 'Delete layer “评审图层”?' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Confirm delete layer' })).toBeTruthy();
        expect(screen.getByText('This action cannot be undone.')).toBeTruthy();
    });
});
