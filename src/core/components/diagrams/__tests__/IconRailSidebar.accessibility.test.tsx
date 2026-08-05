// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IconRailSidebar } from '../IconRailSidebar';
import type { MobileIconRailPanelRequest } from '../iconRailSidebarState';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

const Harness = () => {
    const [requestedPanel, setRequestedPanel] = useState<MobileIconRailPanelRequest | null>(null);

    return (
        <>
            <button type="button" onClick={() => setRequestedPanel('layers')}>
                移动端图层入口
            </button>
            <IconRailSidebar
                isMobile
                autoOpenShapes={false}
                requestedPanel={requestedPanel}
                onRequestedPanelHandled={() => setRequestedPanel(null)}
                layers={[]}
                onCreateLayer={() => true}
            />
        </>
    );
};

describe('IconRailSidebar drawer accessibility', () => {
    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn().mockImplementation(() => ({
                matches: false,
                media: '',
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    it('moves focus into a labelled mobile dialog and restores its trigger after Escape', async () => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: '移动端图层入口' });
        trigger.focus();
        fireEvent.click(trigger);

        const dialog = await screen.findByRole('dialog', { name: 'designer.sidebar.layers' });
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        const closeButton = screen.getByRole('button', { name: '关闭' });
        await waitFor(() => expect(document.activeElement).toBe(closeButton));

        fireEvent.keyDown(closeButton, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(document.activeElement).toBe(trigger);
        });
    });
});
