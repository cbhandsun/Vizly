// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
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
    it('stays below global modals while keeping its own popups above the panel', () => {
        render(
            <DraggableSettingsPanel title="打开更多设置" onClose={vi.fn()}>
                <div>设置内容</div>
            </DraggableSettingsPanel>,
        );

        const panel = screen.getByText('设置内容').parentElement?.parentElement;
        expect(panel?.style.zIndex).toBe(String(SETTINGS_PANEL_Z_INDEX));
        expect(SETTINGS_PANEL_Z_INDEX).toBeLessThan(1000);
        expect(SETTINGS_PANEL_POPUP_Z_INDEX).toBeGreaterThan(SETTINGS_PANEL_Z_INDEX);
        expect(SETTINGS_PANEL_POPUP_Z_INDEX).toBeLessThan(1000);
    });

    it('provides a named close action', () => {
        render(
            <DraggableSettingsPanel title="打开更多设置" onClose={vi.fn()}>
                <div>设置内容</div>
            </DraggableSettingsPanel>,
        );

        expect(screen.getByRole('button', { name: '关闭打开更多设置' })).toBeTruthy();
    });
});
