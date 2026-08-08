// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { MobileBottomDock } from '../MobileBottomDock';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, params?: Record<string, number>) => (
            Object.entries(params ?? {}).reduce(
                (result, [key, value]) => result.replace(`{{${key}}}`, String(value)),
                fallback,
            )
        ),
    }),
}));

describe('MobileBottomDock', () => {
    it('keeps history actions at the shared commercial touch target', () => {
        const css = readFileSync(
            'src/core/components/layout/MobileBottomDock.css',
            'utf8',
        );

        expect(css).toMatch(/\.mobile-bottom-dock-actions\s*\{[\s\S]*?grid-template-columns:[\s\S]*?repeat\(3, var\(--commercial-touch-target, 44px\)\)/);
        expect(css).toMatch(/\.mobile-dock-btn\.mini\s*\{[\s\S]*?min-width: var\(--commercial-touch-target, 44px\);[\s\S]*?min-height: var\(--commercial-touch-target, 44px\);/);
    });

    it('exposes named mobile actions and keeps disabled history controls inert', () => {
        const onAddClick = vi.fn();
        const onLayerClick = vi.fn();
        render(
            <MobileBottomDock
                onAddClick={onAddClick}
                onPropertyClick={vi.fn()}
                onLayerClick={onLayerClick}
                onSettingsClick={vi.fn()}
                onAiClick={vi.fn()}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                canUndo={false}
                canRedo={false}
                selectedCount={2}
                selectedNodesCount={1}
                selectedEdgesCount={1}
                activeTab="property"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '添加组件' }));
        expect(onAddClick).toHaveBeenCalledTimes(1);
        const propertyButton = screen.getByRole('button', { name: '属性—已选择：节点 1 个，连线 1 条' });
        expect(propertyButton.getAttribute('aria-haspopup')).toBe('dialog');
        expect(propertyButton.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByRole('status').textContent).toBe('属性—已选择：节点 1 个，连线 1 条');
        const layerButton = screen.getByRole('button', { name: '图层' });
        expect(layerButton.getAttribute('aria-haspopup')).toBe('dialog');
        fireEvent.click(layerButton);
        expect(onLayerClick).toHaveBeenCalledTimes(1);
        const aiButton = screen.getByRole('button', { name: 'AI 助手' });
        expect(aiButton.getAttribute('aria-haspopup')).toBe('dialog');
        expect(aiButton.getAttribute('aria-expanded')).toBe('false');
        expect((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: '重做' }) as HTMLButtonElement).disabled).toBe(true);
        const settingsButton = screen.getByRole('button', { name: '设置' });
        expect(settingsButton.getAttribute('data-settings-focus-return')).toBe('primary');
    });

    it('keeps enabled history actions operable after moving them into the main dock grid', () => {
        const onUndo = vi.fn();
        const onRedo = vi.fn();
        render(
            <MobileBottomDock
                onAddClick={vi.fn()}
                onPropertyClick={vi.fn()}
                onLayerClick={vi.fn()}
                onAiClick={vi.fn()}
                onUndo={onUndo}
                onRedo={onRedo}
                canUndo
                canRedo
                selectedCount={0}
                activeTab={null}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '撤销' }));
        fireEvent.click(screen.getByRole('button', { name: '重做' }));

        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(onRedo).toHaveBeenCalledTimes(1);
    });

    it('disables editing actions when the canvas is read-only', () => {
        const onAddClick = vi.fn();
        const onPropertyClick = vi.fn();
        const onAiClick = vi.fn();
        render(
            <MobileBottomDock
                onAddClick={onAddClick}
                onPropertyClick={onPropertyClick}
                onLayerClick={vi.fn()}
                onAiClick={onAiClick}
                selectedCount={0}
                activeTab={null}
                editingDisabled
            />,
        );

        const addButton = screen.getByRole('button', { name: '添加组件' });
        const propertyButton = screen.getByRole('button', { name: '属性' });
        const aiButton = screen.getByRole('button', { name: 'AI 助手' });
        expect((addButton as HTMLButtonElement).disabled).toBe(true);
        expect((propertyButton as HTMLButtonElement).disabled).toBe(true);
        expect((aiButton as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(addButton);
        fireEvent.click(propertyButton);
        fireEvent.click(aiButton);
        expect(onAddClick).not.toHaveBeenCalled();
        expect(onPropertyClick).not.toHaveBeenCalled();
        expect(onAiClick).not.toHaveBeenCalled();
        expect((screen.getByRole('button', { name: '图层' }) as HTMLButtonElement).disabled).toBe(false);
    });
});
