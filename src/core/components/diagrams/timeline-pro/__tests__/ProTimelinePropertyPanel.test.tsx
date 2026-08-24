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
    'plugins.timeline.propertyPanel.fields.parent': 'Parent task',
    'plugins.timeline.propertyPanel.types.phase': 'Phase',
    'plugins.timeline.propertyPanel.types.milestone': 'Milestone',
    'plugins.timeline.propertyPanel.types.event': 'Event',
    'plugins.timeline.propertyPanel.types.summary': 'Summary (derived)',
    'plugins.timeline.propertyPanel.typeSummaryHint': 'Tasks with subtasks are summaries. Remove or reparent subtasks before changing the type.',
    'plugins.timeline.propertyPanel.parentRoot': 'No parent (top level)',
    'plugins.timeline.propertyPanel.parentHint': 'Move this task and all of its subtasks. Descendants are excluded to prevent hierarchy cycles.',
    'plugins.timeline.propertyPanel.reparentSuccess': 'Task hierarchy updated. Use Undo to restore it.',
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
    'plugins.timeline.propertyPanel.deleteImpact.heading': 'Deletion impact',
    'plugins.timeline.propertyPanel.deleteImpact.taskCount': 'Tasks to delete',
    'plugins.timeline.propertyPanel.deleteImpact.dependencyCount': 'Dependencies to remove',
    'plugins.timeline.propertyPanel.deleteImpact.affectedSubtasks': 'Affected subtasks',
    'plugins.timeline.propertyPanel.deleteImpact.hiddenSubtasks': '{{count}} more subtasks',
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

    it.each(['event', 'milestone'] as const)('keeps %s editing atomic and hides ranged-work controls', (type) => {
        const pointNode = phaseNode(type);
        pointNode.data.type = type;
        const { context } = createHarness([pointNode]);

        render(<ProTimelinePropertyPanel ctx={context} selectedNodes={[pointNode]} selectedEdges={[]} />);

        expect(screen.getByLabelText('Start date')).toBeTruthy();
        expect(screen.queryByLabelText('End date')).toBeNull();
        expect(screen.queryByLabelText('Task progress')).toBeNull();
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

    it('shows a derived summary type when the selected task owns subtasks', () => {
        const parent = phaseNode('parent');
        const child = phaseNode('child', 'parent');
        const { context } = createHarness([parent, child]);

        render(<ProTimelinePropertyPanel ctx={context} selectedNodes={[parent]} selectedEdges={[]} />);

        const typeSelect = screen.getByLabelText('Task type') as HTMLInputElement;
        expect(typeSelect.disabled).toBe(true);
        expect(screen.getByText('Summary (derived)')).toBeTruthy();
        expect(screen.getByText(
            'Tasks with subtasks are summaries. Remove or reparent subtasks before changing the type.',
        )).toBeTruthy();
        expect(screen.queryByLabelText('Status')).toBeNull();
        expect(screen.getByLabelText('Task progress').getAttribute('aria-disabled')).toBe('true');
    });

    it('exposes a cycle-safe parent selector and snapshots top-level promotion', () => {
        const parent = phaseNode('parent');
        parent.data.label = 'Parent';
        const child = phaseNode('child', 'parent');
        child.data.label = 'Child';
        const grandchild = phaseNode('grandchild', 'child');
        grandchild.data.label = 'Grandchild';
        const other = phaseNode('other');
        other.data.label = 'Other';
        const { context, getNodes } = createHarness([parent, child, grandchild, other]);

        render(<ProTimelinePropertyPanel ctx={context} selectedNodes={[child]} selectedEdges={[]} />);

        const parentSelect = screen.getByLabelText('Parent task');
        expect(parentSelect).toBeTruthy();
        expect(screen.getByText(
            'Move this task and all of its subtasks. Descendants are excluded to prevent hierarchy cycles.',
        )).toBeTruthy();

        fireEvent.mouseDown(parentSelect);
        expect(screen.queryByText('Child')).toBeNull();
        expect(screen.queryByText('Grandchild')).toBeNull();
        expect(screen.getByText('Other')).toBeTruthy();
        fireEvent.click(screen.getByText('No parent (top level)'));

        expect(context.takeSnapshot).toHaveBeenCalledTimes(1);
        expect(getNodes().find(node => node.id === 'child')?.data).not.toHaveProperty('parentId');
        expect(getNodes().find(node => node.id === 'grandchild')?.data.parentId).toBe('child');
        expect(messageMocks.success).toHaveBeenCalledWith('Task hierarchy updated. Use Undo to restore it.');
    });

    it('renders malformed imported values through safe field boundaries', () => {
        const malformed = phaseNode();
        malformed.data = {
            ...malformed.data,
            label: `Launch\u0000${'x'.repeat(200)}`,
            assignee: { unsafe: true },
            status: 'unknown',
            priority: 'urgent',
            progress: Number.POSITIVE_INFINITY,
        };
        const { context } = createHarness([malformed]);

        render(<ProTimelinePropertyPanel ctx={context} selectedNodes={[malformed]} selectedEdges={[]} />);

        const name = screen.getByLabelText('Task name') as HTMLInputElement;
        expect(Array.from(name.value)).toHaveLength(160);
        expect(name.value).not.toContain('\u0000');
        expect((screen.getByLabelText('Assignee') as HTMLInputElement).value).toBe('');
        expect(screen.getByText('Current progress 0%')).toBeTruthy();
    });

    it('uses one stable message slot for repeated date validation failures', () => {
        expect(createTimelineDateValidationMessage('End date is invalid')).toEqual({
            key: 'timeline-property-date-validation',
            content: 'End date is invalid',
        });
        expect(createTimelineDateValidationMessage('Start date is invalid').key)
            .toBe('timeline-property-date-validation');
    });

    it('keeps a rejected date visibly marked without saving it', () => {
        const node = phaseNode();
        const { context } = createHarness([node]);
        const { rerender } = render(
            <ProTimelinePropertyPanel ctx={context} selectedNodes={[node]} selectedEdges={[]} />,
        );
        const endDate = screen.getByLabelText('End date') as HTMLInputElement;

        fireEvent.change(endDate, { target: { value: '2026-08-09' } });
        fireEvent.keyDown(endDate, { key: 'Enter', code: 'Enter' });

        expect(messageMocks.warning).toHaveBeenCalledTimes(1);
        expect((screen.getByLabelText('End date') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true');
        expect(screen.getByRole('alert').textContent).toBe(
            'plugins.timeline.propertyPanel.validation.end-before-start',
        );
        expect(context.takeSnapshot).not.toHaveBeenCalled();

        const otherNode = phaseNode('other');
        rerender(<ProTimelinePropertyPanel ctx={context} selectedNodes={[otherNode]} selectedEdges={[]} />);
        rerender(<ProTimelinePropertyPanel ctx={context} selectedNodes={[node]} selectedEdges={[]} />);
        expect(screen.queryByRole('alert')).toBeNull();
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
        expect(dialog.textContent).toContain('Deletion impact');
        expect(dialog.textContent).toContain('Tasks to delete2');
        expect(dialog.textContent).toContain('Dependencies to remove1');
        expect(dialog.textContent).toContain('Affected subtasks');
        expect(dialog.textContent).toContain('Launch readiness');
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
