// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArchitecturePlugin } from '../ArchitecturePlugin';
import type { PluginContext } from '../../types/plugin';

const translations: Record<string, string> = {
    'designer.sidebar.searchComponents': 'Search components...',
    'designer.sidebar.clearSearch': 'Clear search',
    'designer.sidebar.noComponentsFound': 'No components match “{{query}}”.',
    'designer.sidebar.showAllComponents': 'Show all components',
    'designer.architecture.addComponent': 'Add {{component}} component',
    'designer.architecture.categories.network': 'Network & access',
    'designer.architecture.categories.compute': 'Compute & services',
    'designer.architecture.categories.data': 'Data & storage',
    'designer.architecture.categories.business': 'Business domains',
    'designer.architecture.components.frontend': 'Client',
    'designer.architecture.components.gateway': 'Gateway',
    'designer.architecture.components.microservice': 'Microservice',
    'designer.architecture.components.messageQueue': 'Message queue',
    'designer.architecture.components.cache': 'Cache',
    'designer.architecture.components.storage': 'Storage',
    'designer.architecture.components.database': 'Database',
    'designer.architecture.components.system': 'Business system',
    'designer.architecture.components.component': 'Component',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            const template = translations[key] ?? key;
            return template
                .replace('{{query}}', String(values?.query ?? ''))
                .replace('{{component}}', String(values?.component ?? ''));
        },
    }),
}));

const context: PluginContext = {
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

const renderPalette = () => {
    const panel = new ArchitecturePlugin()
        .contributeSidebarPanels(context)
        .find((candidate) => candidate.id === 'arch-components');
    if (!panel) throw new Error('Architecture component panel is missing');
    render(<>{panel.content}</>);
};

describe('ArchitecturePlugin component-library accessibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('localizes categories and exposes keyboard-operable component and disclosure buttons', () => {
        renderPalette();

        const category = screen.getByRole('button', { name: 'Network & access' });
        expect(category.getAttribute('aria-expanded')).toBe('true');
        expect(category.getAttribute('aria-controls')).toBe('architecture-category-network');

        const client = screen.getByRole('button', { name: 'Add Client component' });
        fireEvent.click(client);
        expect(context.addNode).toHaveBeenCalledWith('architectureNode', {
            label: 'Client',
            type: 'frontend',
            themeColor: '#a0d911',
        });

        fireEvent.click(category);
        expect(category.getAttribute('aria-expanded')).toBe('false');
    });

    it('announces localized search failure, bounds input, and provides a visible recovery action', () => {
        renderPalette();

        const search = screen.getByRole('textbox', { name: 'Search components...' });
        expect(search.getAttribute('maxlength')).toBe('100');
        fireEvent.change(search, { target: { value: 'zzzz-no-match' } });

        const status = screen.getByRole('status');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.textContent).toContain('No components match “zzzz-no-match”.');
        expect(screen.queryByText('无匹配组件')).toBeNull();

        const recovery = screen.getByRole('button', { name: 'Show all components' });
        fireEvent.click(recovery);
        expect((search as HTMLInputElement).value).toBe('');
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('button', { name: 'Add Client component' })).toBeTruthy();
    });
});
