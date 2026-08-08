// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowchartShapesPanel } from '../FlowchartShapesPanel';
import type { PluginContext } from '../../../types/plugin';

const translations: Record<string, string> = {
    'designer.sidebar.searchComponents': 'Search components...',
    'designer.sidebar.clearSearch': 'Clear search',
    'designer.sidebar.noComponentsFound': 'No components match “{{query}}”.',
    'designer.sidebar.showAllComponents': 'Show all components',
    'designer.sidebar.addAndConnectHint': 'Click to add a shape.',
    'designer.sidebar.basic': 'Basic Shapes',
    'designer.sidebar.flowControl': 'Flow Control',
    'designer.sidebar.dataIO': 'Data & I/O',
    'designer.sidebar.containers': 'Containers',
    'designer.sidebar.techIcons': 'Tech Icons',
    'designer.sidebar.special': 'Special',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            const template = translations[key] ?? key.split('.').at(-1) ?? key;
            return template.replace('{{query}}', String(values?.query ?? ''));
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

describe('FlowchartShapesPanel search recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('announces a localized no-result state and offers a visible recovery action', () => {
        render(<FlowchartShapesPanel ctx={context} />);

        const search = screen.getByRole('textbox', { name: 'Search components...' });
        fireEvent.change(search, { target: { value: 'zzzz-no-match' } });

        const status = screen.getByRole('status');
        expect(status.textContent).toContain('No components match “zzzz-no-match”.');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(screen.queryByText('无匹配组件')).toBeNull();

        const recoveryButton = status.querySelector('button');
        expect(recoveryButton?.textContent).toBe('Show all components');
        if (!recoveryButton) throw new Error('Expected a visible clear-search recovery button');
        fireEvent.click(recoveryButton);
        expect((search as HTMLInputElement).value).toBe('');
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('button', { name: 'circle' })).toBeTruthy();
    });

    it('caps search input length at the commercial UI boundary', () => {
        render(<FlowchartShapesPanel ctx={context} />);
        expect(screen.getByRole('textbox', { name: 'Search components...' }).getAttribute('maxlength')).toBe('100');
    });
});
