// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '../../../../types/plugin';
import { ProTimelinePropertyPanel } from '../ProTimelinePropertyPanel';
import { createTimelineDateValidationMessage } from '../timelineDateValidationFeedback';

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const messageMocks = vi.hoisted(() => ({
    success: vi.fn(),
    warning: vi.fn(),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({ appMessage: messageMocks }));
vi.mock('@/core/themes/useCoreTheme', () => ({ useTheme: () => [null, vi.fn()] }));

const translations: Record<string, string> = {
    'plugins.timeline.propertyPanel.title': 'Timeline task properties',
    'plugins.timeline.propertyPanel.empty': 'Select a timeline task to edit',
    'plugins.timeline.propertyPanel.sections.basic': 'Basic information',
    'plugins.timeline.propertyPanel.sections.schedule': 'Schedule and progress',
    'plugins.timeline.propertyPanel.fields.name': 'Task name',
    'plugins.timeline.propertyPanel.fields.type': 'Task type',
    'plugins.timeline.propertyPanel.fields.status': 'Status',
    'plugins.timeline.propertyPanel.fields.assignee': 'Assignee',
    'plugins.timeline.propertyPanel.fields.priority': 'Priority',
    'plugins.timeline.propertyPanel.fields.startDate': 'Start date',
    'plugins.timeline.propertyPanel.fields.endDate': 'End date',
    'plugins.timeline.propertyPanel.fields.progress': 'Current progress {{value}}%',
    'plugins.timeline.propertyPanel.fields.progressLabel': 'Task progress',
    'plugins.timeline.propertyPanel.types.phase': 'Phase',
    'plugins.timeline.propertyPanel.types.milestone': 'Milestone',
    'plugins.timeline.propertyPanel.types.event': 'Event',
    'plugins.timeline.propertyPanel.statuses.pending': 'Not started',
    'plugins.timeline.propertyPanel.statuses.active': 'In progress',
    'plugins.timeline.propertyPanel.statuses.done': 'Completed',
    'plugins.timeline.propertyPanel.priorities.high': 'High',
    'plugins.timeline.propertyPanel.priorities.medium': 'Medium',
    'plugins.timeline.propertyPanel.priorities.low': 'Low',
    'plugins.timeline.propertyPanel.placeholders.assignee': 'Enter an assignee',
    'plugins.timeline.propertyPanel.placeholders.priority': 'Select a priority',
    'plugins.timeline.propertyPanel.deleteTask': 'Delete task',
    'plugins.timeline.propertyPanel.deleteConfirmTitle': 'Delete this task?',
    'plugins.timeline.propertyPanel.deleteConfirmDescription': 'This also removes its subtasks and related connectors. You can undo this action.',
    'plugins.timeline.propertyPanel.deleteConfirm': 'Confirm deletion',
    'plugins.timeline.propertyPanel.deleteSuccess': 'Deleted {{count}} task(s). Use Undo to restore them.',
    'common.cancel': 'Cancel',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, string | number>) => {
            const template = translations[key] ?? key;
            return Object.entries(values ?? {}).reduce(
                (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
                template,
            );
        },
    }),
}));

const phaseNode = (id = 'phase', parentId?: string): Node => ({
    id,
    type: 'timelineNode',
    position: { x: 0, y: 0 },
    selected: true,
    data: {
        type: 'phase',
        label: 'Launch readiness',
        status: 'pending',
        date: '2026-08-10',
        endDate: '2026-08-24',
        progress: 0,
        parentId,
    },
});

const createHarness = (
    initialNodes: Node[] = [phaseNode()],
    initialEdges: Edge[] = [],
) => {
    let nodes = initialNodes;
    let edges = initialEdges;
    const context: PluginContext = {
        nodes,
        edges,
        getNodes: vi.fn(() => nodes),
        getEdges: vi.fn(() => edges),
        setNodes: vi.fn(update => {
            nodes = typeof update === 'function' ? update(nodes) : update;
        }),
        setEdges: vi.fn(update => {
            edges = typeof update === 'function' ? update(edges) : update;
        }),
        takeSnapshot: vi.fn(),
        updateNodesBatch: vi.fn(),
        updateEdgesBatch: vi.fn(),
        addNode: vi.fn(),
    };
    return { context, getNodes: () => nodes, getEdges: () => edges };
};

describe('ProTimelinePropertyPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders localized copy and exposes accessible field names', () => {
        const { context } = createHarness();
        render(<ProTimelinePropertyPanel ctx={context} selectedNodes={[phaseNode()]} selectedEdges={[]} />);

        expect(screen.getByText('Timeline task properties')).toBeTruthy();
        expect(screen.getByLabelText('Task name')).toBeTruthy();
        expect(screen.getByLabelText('Assignee')).toBeTruthy();
        expect(screen.getByLabelText('Start date')).toBeTruthy();
        expect(screen.getByLabelText('End date')).toBeTruthy();
        expect(screen.queryByText('面板属性')).toBeNull();
    });

    it('creates one history entry for a continuous text-edit gesture', () => {
        const { context, getNodes } = createHarness();
        render(<ProTimelinePropertyPanel ctx={context} selectedNodes={[phaseNode()]} selectedEdges={[]} />);
        const input = screen.getByLabelText('Task name');

        fireEvent.change(input, { target: { value: 'Launch' } });
        fireEvent.change(input, { target: { value: 'Launch ready' } });

        expect(context.takeSnapshot).toHaveBeenCalledTimes(1);
        expect(getNodes()[0]?.data.label).toBe('Launch ready');

        fireEvent.blur(input);
        fireEvent.change(input, { target: { value: 'Launch approved' } });
        expect(context.takeSnapshot).toHaveBeenCalledTimes(2);
    });

    it('does not create a history entry when the value does not change', () => {
        const { context } = createHarness();
        render(<ProTimelinePropertyPanel ctx={context} selectedNodes={[phaseNode()]} selectedEdges={[]} />);

        fireEvent.change(screen.getByLabelText('Task name'), {
            target: { value: 'Launch readiness' },
        });

        expect(context.takeSnapshot).not.toHaveBeenCalled();
    });

    it('uses one stable message slot for repeated date validation failures', () => {
        expect(createTimelineDateValidationMessage('End date is invalid')).toEqual({
            key: 'timeline-property-date-validation',
            content: 'End date is invalid',
        });
        expect(createTimelineDateValidationMessage('Start date is invalid').key)
            .toBe('timeline-property-date-validation');
    });

    it('uses an accessible dialog and snapshots cascade deletion', async () => {
        const root = phaseNode('root');
        const child = phaseNode('child', 'root');
        const other = phaseNode('other');
        const { context, getNodes, getEdges } = createHarness(
            [root, child, other],
            [
                { id: 'root-child', source: 'root', target: 'child' },
                { id: 'other-loop', source: 'other', target: 'other' },
            ],
        );
        render(<ProTimelinePropertyPanel ctx={context} selectedNodes={[root]} selectedEdges={[]} />);

        fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toContain('This also removes its subtasks and related connectors. You can undo this action.');
        expect(context.takeSnapshot).not.toHaveBeenCalled();
        const confirmButton = screen.getByRole('button', { name: 'Confirm deletion' });
        expect(confirmButton.classList.contains('ant-btn-primary')).toBe(true);
        expect(confirmButton.classList.contains('ant-btn-dangerous')).toBe(true);
        fireEvent.click(confirmButton);

        expect(context.takeSnapshot).toHaveBeenCalledTimes(1);
        expect(getNodes().map(node => node.id)).toEqual(['other']);
        expect(getEdges().map(edge => edge.id)).toEqual(['other-loop']);
        expect(messageMocks.success).toHaveBeenCalledWith(
            'Deleted 2 task(s). Use Undo to restore them.',
        );
    });
});
