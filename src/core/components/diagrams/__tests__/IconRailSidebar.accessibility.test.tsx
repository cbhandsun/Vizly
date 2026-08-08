// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IconRailSidebar } from '../IconRailSidebar';
import { FlowchartShapesPanel } from '../FlowchartShapesPanel';
import type { MobileIconRailPanelRequest } from '../iconRailSidebarState';
import type { PluginContext } from '../../../types/plugin';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: string | { count?: number }) => ({
            'designer.sidebar.basic': 'Basic Shapes',
            'designer.sidebar.iconLibrary': 'Cloud icon library',
            'designer.sidebar.comments': 'Comments and feedback',
            'designer.sidebar.templatesWithCount': `Templates (${typeof params === 'object' ? params.count ?? 0 : 0})`,
        }[key] ?? (typeof params === 'string' ? params : key)),
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

const pluginContext: PluginContext = {
    getNodes: () => [],
    getEdges: () => [],
    updateNodesBatch: vi.fn(),
    updateEdgesBatch: vi.fn(),
    takeSnapshot: vi.fn(),
    nodes: [],
    edges: [],
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    addNode: vi.fn(() => 'node-1'),
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

    it('localizes known plugin and built-in rail labels instead of exposing Chinese metadata', async () => {
        render(
            <IconRailSidebar
                autoOpenShapes={false}
                pluginPanels={[
                    {
                        id: 'shapes',
                        title: '基础形状',
                        icon: <span aria-hidden="true">S</span>,
                        content: <div>Shapes</div>,
                    },
                    {
                        id: 'icons',
                        title: '云端图标库',
                        icon: <span aria-hidden="true">I</span>,
                        content: <div>Icons</div>,
                    },
                ]}
            />,
        );

        expect(screen.getByRole('button', { name: 'Basic Shapes' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Cloud icon library' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Comments and feedback' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '基础形状' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Basic Shapes' }));
        expect(await screen.findByRole('dialog', { name: 'Basic Shapes' })).toBeTruthy();
    });

    it('routes the component-search trigger directly to the drawer search field', async () => {
        render(
            <IconRailSidebar
                isMobile
                autoOpenShapes={false}
                pluginPanels={[{
                    id: 'shapes',
                    title: '基础形状',
                    icon: <span aria-hidden="true">S</span>,
                    content: <FlowchartShapesPanel ctx={pluginContext} />,
                }]}
            />,
        );

        const searchTrigger = screen.getByRole('button', {
            name: 'designer.sidebar.searchComponents',
        });
        fireEvent.click(searchTrigger);

        const searchInput = await screen.findByRole('textbox', {
            name: 'designer.sidebar.searchComponents',
        });
        await waitFor(() => expect(document.activeElement).toBe(searchInput));

        fireEvent.change(searchInput, { target: { value: 'designer.sidebar.database' } });
        await waitFor(() => {
            expect(screen.getByRole('textbox', {
                name: 'designer.sidebar.searchComponents',
            })).toBe(searchInput);
            expect(document.activeElement).toBe(searchInput);
        });

        fireEvent.keyDown(searchInput, { key: 'Escape' });
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(document.activeElement).toBe(searchTrigger);
        });
    });
});
