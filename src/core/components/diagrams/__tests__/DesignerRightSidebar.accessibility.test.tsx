// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignerRightSidebar } from '../DesignerRightSidebar';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'propertyPanel.title': '属性设置',
            'aiChat.title': 'AI 架构助手',
        })[key] ?? key,
    }),
}));

const Harness = () => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(true)}
            >
                打开属性抽屉
            </button>
            <DesignerRightSidebar
                activeTab="ai"
                onTabChange={vi.fn()}
                aiChatVisible
                setAiChatVisible={vi.fn()}
                selectedNodes={[]}
                selectedEdges={[]}
                updateNodesBatch={vi.fn()}
                updateEdgesBatch={vi.fn()}
                onBeforeUpdate={vi.fn()}
                isDraggingNode={false}
                renderAIChatPanel={() => <button type="button">AI 操作</button>}
                isMobile
                mobileOpen={open}
                onMobileOpenChange={setOpen}
            />
        </>
    );
};

describe('DesignerRightSidebar mobile dialog accessibility', () => {
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

    it('moves focus into the labelled drawer, closes on Escape, and restores its trigger', async () => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: '打开属性抽屉' });
        trigger.focus();
        fireEvent.click(trigger);

        const dialog = await screen.findByRole('dialog', { name: 'AI 架构助手' });
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        const rail = screen.getByTestId('designer-right-sidebar-rail');
        expect(rail.style.position).toBe('absolute');
        expect(rail.style.zIndex).toBe('2');
        expect(rail.style.backgroundColor).not.toBe('');
        expect(screen.getByTestId('designer-right-sidebar-content').style.marginRight).not.toBe('');
        const closeButton = screen.getByRole('button', { name: '收起面板' });
        await waitFor(() => expect(document.activeElement).toBe(closeButton));

        fireEvent.keyDown(closeButton, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('restores the expanded trigger after pointer activation that did not focus it', async () => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: '打开属性抽屉' });
        expect(document.activeElement).not.toBe(trigger);
        fireEvent.click(trigger);

        const closeButton = await screen.findByRole('button', { name: '收起面板' });
        await waitFor(() => expect(document.activeElement).toBe(closeButton));
        fireEvent.keyDown(closeButton, { key: 'Escape' });

        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
});
