// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';

import {
    DraggableSettingsPanel,
    SETTINGS_PANEL_POPUP_Z_INDEX,
    SETTINGS_PANEL_Z_INDEX,
} from '../DraggableSettingsPanel';
import { useModalFocusTrap } from '../../../hooks/useModalFocusTrap';

vi.mock('../../../hooks/useDraggablePanel', () => ({
    useDraggablePanel: () => ({
        panelRef: { current: null },
        handlePointerDown: vi.fn(),
    }),
}));

const NestedModal = ({ active }: { active: boolean }) => {
    const { containerRef } = useModalFocusTrap<HTMLDivElement>({
        active,
        onClose: vi.fn(),
    });
    if (!active) return null;
    return createPortal(
        <div ref={containerRef} role="dialog" aria-modal="true" aria-label="嵌套设置" tabIndex={-1} />,
        document.body,
    );
};

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

    it('removes the background dialog from the modal accessibility tree while a nested modal is active', async () => {
        const { rerender } = render(
            <DraggableSettingsPanel title="打开更多设置" onClose={vi.fn()}>
                <NestedModal active />
            </DraggableSettingsPanel>,
        );

        const outerDialog = screen.getByText('打开更多设置').closest('[role="dialog"]');
        expect(screen.getByRole('dialog', { name: '嵌套设置' }).getAttribute('aria-modal')).toBe('true');
        await waitFor(() => {
            expect(outerDialog?.getAttribute('aria-hidden')).toBe('true');
            expect(outerDialog?.hasAttribute('aria-modal')).toBe(false);
        });

        rerender(
            <DraggableSettingsPanel title="打开更多设置" onClose={vi.fn()}>
                <NestedModal active={false} />
            </DraggableSettingsPanel>,
        );

        await waitFor(() => {
            expect(outerDialog?.hasAttribute('aria-hidden')).toBe(false);
            expect(outerDialog?.getAttribute('aria-modal')).toBe('true');
        });
    });
});
