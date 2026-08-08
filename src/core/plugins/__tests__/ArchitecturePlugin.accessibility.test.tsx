// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { ArchitecturePlugin } from '../ArchitecturePlugin';
import type { PluginContext } from '../../types/plugin';
import { useDiagramStore } from '../../store/useDiagramStore';

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
    'designer.architecture.validation.empty.title': 'Nothing to validate yet',
    'designer.architecture.validation.empty.description': 'Add at least one architecture component to start validation.',
    'designer.architecture.validation.compliant.title': 'No issues found',
    'designer.architecture.validation.compliant.description': 'Checked {{nodeCount}} component(s) and {{edgeCount}} connection(s).',
    'designer.architecture.validation.summary.error': '{{count}} error(s)',
    'designer.architecture.validation.summary.warning': '{{count}} warning(s)',
    'designer.architecture.validation.summary.info': '{{count}} suggestion(s)',
    'designer.architecture.validation.severity.error': 'Error',
    'designer.architecture.validation.severity.warning': 'Warning',
    'designer.architecture.validation.severity.info': 'Suggestion',
    'designer.architecture.validation.inspectIssue': 'Inspect {{ruleId}}: {{message}}',
    'designer.architecture.validation.rules.sec001': 'Client applications must not connect directly to databases.',
    'designer.architecture.validation.rules.iso001': 'This component is isolated and is not connected to the architecture.',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            const template = translations[key] ?? key;
            return Object.entries(values ?? {}).reduce(
                (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
                template,
            );
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

const renderLinter = () => {
    const panel = new ArchitecturePlugin()
        .contributeSidebarPanels(context)
        .find((candidate) => candidate.id === 'arch-linter');
    if (!panel) throw new Error('Architecture validation panel is missing');
    render(<>{panel.content}</>);
};

const architectureNode = (id: string, type: string): Node => ({
    id,
    type: 'architectureNode',
    position: { x: 0, y: 0 },
    data: { label: id, type },
});

describe('ArchitecturePlugin component-library accessibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useDiagramStore.setState({ nodes: [], edges: [] });
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

describe('ArchitecturePlugin validation accessibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useDiagramStore.setState({ nodes: [], edges: [] });
    });

    it('keeps an empty diagram neutral instead of reporting compliance', () => {
        renderLinter();

        const status = screen.getByRole('status');
        expect(status.textContent).toContain('Nothing to validate yet');
        expect(status.textContent).not.toContain('No issues found');
        expect(screen.queryByText('架构合规')).toBeNull();
    });

    it('reports an isolated component and focuses its source node from a native button', () => {
        useDiagramStore.setState({
            nodes: [architectureNode('client', 'frontend')],
            edges: [],
        });
        const focusListener = vi.fn();
        window.addEventListener('editor:focus-entity', focusListener);

        renderLinter();

        expect(screen.getByRole('status').textContent).toContain('1 suggestion(s)');
        const issue = screen.getByRole('button', {
            name: 'Inspect ISO-001: This component is isolated and is not connected to the architecture.',
        });
        issue.focus();
        expect(document.activeElement).toBe(issue);
        fireEvent.click(issue);
        expect(focusListener).toHaveBeenCalledTimes(1);
        expect((focusListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ nodeId: 'client' });
        const updateNodes = vi.mocked(context.setNodes).mock.calls[0]?.[0];
        expect(typeof updateNodes).toBe('function');
        if (typeof updateNodes === 'function') {
            expect(updateNodes([
                architectureNode('client', 'frontend'),
                architectureNode('other', 'component'),
            ]).map(node => ({ id: node.id, selected: node.selected }))).toEqual([
                { id: 'client', selected: true },
                { id: 'other', selected: false },
            ]);
        }

        window.removeEventListener('editor:focus-entity', focusListener);
    });

    it('localizes an edge violation and targets the invalid connection', () => {
        const edge: Edge = { id: 'direct-db', source: 'client', target: 'database' };
        useDiagramStore.setState({
            nodes: [
                architectureNode('client', 'frontend'),
                architectureNode('database', 'database'),
            ],
            edges: [edge],
        });
        const focusListener = vi.fn();
        window.addEventListener('editor:focus-entity', focusListener);

        renderLinter();

        expect(screen.getByRole('status').textContent).toContain('1 error(s)');
        const issue = screen.getByRole('button', {
            name: 'Inspect SEC-001: Client applications must not connect directly to databases.',
        });
        expect(screen.queryByText('安全违规: 终端不可绕过网关直连数据库')).toBeNull();
        fireEvent.click(issue);
        expect((focusListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
            edgeId: 'direct-db',
        });
        const updateEdges = vi.mocked(context.setEdges).mock.calls[0]?.[0];
        expect(typeof updateEdges).toBe('function');
        if (typeof updateEdges === 'function') {
            expect(updateEdges([
                edge,
                { id: 'other-edge', source: 'database', target: 'client' },
            ]).map(candidate => ({ id: candidate.id, selected: candidate.selected }))).toEqual([
                { id: 'direct-db', selected: true },
                { id: 'other-edge', selected: false },
            ]);
        }

        window.removeEventListener('editor:focus-entity', focusListener);
    });

    it('reports checked component and connection counts for a valid topology', () => {
        useDiagramStore.setState({
            nodes: [
                architectureNode('gateway', 'gateway'),
                architectureNode('service', 'microservice'),
            ],
            edges: [{ id: 'safe-edge', source: 'gateway', target: 'service' }],
        });

        renderLinter();

        const status = screen.getByRole('status');
        expect(status.textContent).toContain('No issues found');
        expect(status.textContent).toContain('Checked 2 component(s) and 1 connection(s).');
    });
});
