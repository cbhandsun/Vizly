// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignerRightSidebar } from '../DesignerRightSidebar';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'propertyPanel.title': '属性设置',
            'propertyPanel.expand': '展开面板',
            'propertyPanel.collapse': '收起面板',
            'aiChat.title': 'AI 架构助手',
        })[key] ?? key,
    }),
}));

vi.mock('../PropertyPanel', () => ({
    default: () => <div data-testid="property-panel-stub" />,
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

const SwitchingHarness = () => {
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'property' | 'ai'>('property');

    const openTab = (tab: 'property' | 'ai') => {
        setActiveTab(tab);
        setOpen(true);
    };

    return (
        <>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open && activeTab === 'property'}
                onClick={() => openTab('property')}
            >
                打开属性抽屉
            </button>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open && activeTab === 'ai'}
                onClick={() => openTab('ai')}
            >
                打开 AI 抽屉
            </button>
            <DesignerRightSidebar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                aiChatVisible={activeTab === 'ai'}
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
        expect(screen.getByTestId('designer-right-sidebar-content').style.minHeight).toBe('0px');
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

    it('hands focus and close restoration to the dock trigger used to switch tabs', async () => {
        render(<SwitchingHarness />);
        const propertyTrigger = screen.getByRole('button', { name: '打开属性抽屉' });
        const aiTrigger = screen.getByRole('button', { name: '打开 AI 抽屉' });

        propertyTrigger.focus();
        fireEvent.click(propertyTrigger);
        expect(screen.getByRole('dialog', { name: '属性设置' })).toBeTruthy();
        const closeButton = await screen.findByRole('button', { name: '收起面板' });
        await waitFor(() => expect(document.activeElement).toBe(closeButton));

        aiTrigger.focus();
        fireEvent.click(aiTrigger);

        expect(screen.getByRole('dialog', { name: 'AI 架构助手' })).toBeTruthy();
        await waitFor(() => expect(document.activeElement).toBe(closeButton));
        fireEvent.keyDown(closeButton, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(document.activeElement).toBe(aiTrigger);
        });
    });

    it('keeps the property panel inside a bounded scroll region on mobile', async () => {
        render(
            <DesignerRightSidebar
                activeTab="property"
                onTabChange={vi.fn()}
                aiChatVisible={false}
                setAiChatVisible={vi.fn()}
                selectedNodes={[]}
                selectedEdges={[]}
                updateNodesBatch={vi.fn()}
                updateEdgesBatch={vi.fn()}
                onBeforeUpdate={vi.fn()}
                isDraggingNode={false}
                isMobile
                mobileOpen
                onMobileOpenChange={vi.fn()}
            />,
        );

        const scrollRegion = await screen.findByTestId('designer-property-scroll-region');
        expect(scrollRegion.style.height).toBe('100%');
        expect(scrollRegion.style.width).toBe('100%');
        expect(scrollRegion.style.flex).toBe('1 1 100%');
        expect(scrollRegion.style.minHeight).toBe('0px');
        expect(scrollRegion.style.minWidth).toBe('0px');
        expect(scrollRegion.style.overflowY).toBe('auto');
        expect(scrollRegion.style.overscrollBehavior).toBe('contain');

        const tabPanel = screen.getByRole('tabpanel');
        expect(tabPanel.style.flex).toBe('1 1 0%');
        expect(tabPanel.style.minHeight).toBe('0px');
        expect(tabPanel.style.overflow).toBe('hidden');
        expect(screen.getByRole('tab', { name: '属性设置' }).getAttribute('aria-selected'))
            .toBe('true');
    });

    it('supports arrow-key navigation without a layout-measuring tab dependency', async () => {
        render(<SwitchingHarness />);
        fireEvent.click(screen.getByRole('button', { name: '打开属性抽屉' }));
        const propertyTab = await screen.findByRole('tab', { name: '属性设置' });
        propertyTab.focus();
        fireEvent.keyDown(propertyTab, { key: 'ArrowRight' });

        const aiTab = screen.getByRole('tab', { name: 'AI 架构助手' });
        await waitFor(() => {
            expect(aiTab.getAttribute('aria-selected')).toBe('true');
            expect(document.activeElement).toBe(aiTab);
        });
        expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(aiTab.id);
    });
});
