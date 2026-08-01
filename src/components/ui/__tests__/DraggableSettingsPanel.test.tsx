// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    DraggableSettingsPanel,
    SETTINGS_PANEL_POPUP_Z_INDEX,
    SETTINGS_PANEL_Z_INDEX,
} from '../DraggableSettingsPanel';

vi.mock('../../../hooks/useDraggablePanel', () => ({
    useDraggablePanel: () => ({
        panelRef: { current: null },
        handlePointerDown: vi.fn(),
    }),
}));

describe('DraggableSettingsPanel', () => {
    it('blocks app chrome while keeping its own popups above the panel', () => {
        render(
            <DraggableSettingsPanel title="打开更多设置" onClose={vi.fn()}>
                <div>设置内容</div>
            </DraggableSettingsPanel>,
        );

        const panel = screen.getByRole('dialog', { name: '打开更多设置' });
        expect(panel.parentElement?.style.zIndex).toBe(String(SETTINGS_PANEL_Z_INDEX));
        expect(panel.style.width).toBe('calc(100vw - 32px)');
        expect(panel.style.maxWidth).toBe('480px');
        expect(SETTINGS_PANEL_Z_INDEX).toBeGreaterThan(1000);
        expect(SETTINGS_PANEL_POPUP_Z_INDEX).toBeGreaterThan(SETTINGS_PANEL_Z_INDEX);
    });

    it('provides a named close action', () => {
        render(
            <DraggableSettingsPanel title="打开更多设置" onClose={vi.fn()}>
                <div>设置内容</div>
            </DraggableSettingsPanel>,
        );

        const close = screen.getByRole('button', { name: '关闭打开更多设置' });
        expect(close).toBeTruthy();
        expect(close.style.width).toBe('var(--commercial-touch-target, 44px)');
    });

    it('traps focus inside a modal dialog and closes on Escape', () => {
        const onClose = vi.fn();
        render(
            <DraggableSettingsPanel title="打开更多设置" onClose={onClose}>
                <button type="button">内部操作</button>
            </DraggableSettingsPanel>,
        );

        const close = screen.getByRole('button', { name: '关闭打开更多设置' });
        expect(screen.getByRole('dialog', { name: '打开更多设置' }).getAttribute('aria-modal')).toBe('true');
        expect(document.activeElement).toBe(close);

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
    });
});
