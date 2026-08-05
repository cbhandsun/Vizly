// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileBottomDock } from '../MobileBottomDock';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
}));

describe('MobileBottomDock', () => {
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
                activeTab="property"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '添加组件' }));
        expect(onAddClick).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: '属性（已选择 {{count}} 项）' }).getAttribute('aria-pressed')).toBe('true');
        const layerButton = screen.getByRole('button', { name: '图层' });
        expect(layerButton.getAttribute('aria-haspopup')).toBe('dialog');
        fireEvent.click(layerButton);
        expect(onLayerClick).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'AI 助手' })).toBeTruthy();
        expect((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: '重做' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole('button', { name: '设置' })).toBeTruthy();
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
