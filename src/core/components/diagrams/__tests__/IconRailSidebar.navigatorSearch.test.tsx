// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IconRailSidebar } from '../IconRailSidebar';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: { count?: number }) => ({
            'designer.sidebar.navigator': 'Navigator',
            'designer.sidebar.searchNodes': 'Search nodes',
            'designer.sidebar.clearSearch': 'Clear search',
            'designer.sidebar.noNodesFound': 'No nodes found',
            'designer.sidebar.domainGroup': 'Domain Group',
            'designer.sidebar.customNode': 'Custom Node',
            'designer.sidebar.searchResultsStatus': `${params?.count ?? 0} matching nodes`,
        }[key] ?? key),
    }),
}));

describe('IconRailSidebar navigator search feedback', () => {
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

    it('labels the search scope and announces the actual match count', async () => {
        render(
            <IconRailSidebar
                autoOpenShapes={false}
                nodes={[
                    {
                        id: 'logistics-root',
                        type: 'titleGroup',
                        position: { x: 0, y: 0 },
                        data: { description: 'Logistics' },
                    },
                    {
                        id: 'warehouse-child',
                        type: 'custom',
                        parentId: 'logistics-root',
                        position: { x: 0, y: 0 },
                        data: { label: 'Warehouse' },
                    },
                ]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Navigator' }));
        const input = await screen.findByRole('textbox', { name: 'Search nodes' });

        fireEvent.change(input, { target: { value: ' warehouse ' } });

        const status = await screen.findByRole('status');
        expect(status.textContent).toBe('1 matching nodes');
        expect(input.getAttribute('aria-describedby')).toBe(status.id);
    });

    it('announces zero results and removes the description when cleared', async () => {
        render(
            <IconRailSidebar
                autoOpenShapes={false}
                nodes={[{
                    id: 'node-1',
                    type: 'custom',
                    position: { x: 0, y: 0 },
                    data: { label: 'Warehouse' },
                }]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Navigator' }));
        const input = await screen.findByRole('textbox', { name: 'Search nodes' });
        fireEvent.change(input, { target: { value: 'missing' } });

        expect((await screen.findByRole('status')).textContent).toBe('0 matching nodes');
        expect(screen.getByText('No nodes found')).toBeTruthy();

        fireEvent.change(input, { target: { value: '   ' } });
        expect(screen.queryByRole('status')).toBeNull();
        expect(input.hasAttribute('aria-describedby')).toBe(false);
    });
});
