// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '../../types/plugin';
import { TimelinePlugin } from '../TimelinePlugin';

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
});

const messageMocks = vi.hoisted(() => ({
    success: vi.fn(),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({ appMessage: messageMocks }));

const translations: Record<string, string> = {
    'plugins.timeline.title': 'Project Timeline Pro',
    'plugins.timeline.description': 'Timeline description',
    'plugins.timeline.toolbar.addEvent': 'Add event',
    'plugins.timeline.toolbar.addPhase': 'Add phase',
    'plugins.timeline.toolbar.addMilestone': 'Add milestone',
    'plugins.timeline.toolbar.created': '{{item}} added',
    'plugins.timeline.labels.event': 'New event',
    'plugins.timeline.labels.phase': 'New phase',
    'plugins.timeline.labels.milestone': 'New milestone',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, string>) => {
            const template = translations[key] ?? key;
            return Object.entries(values ?? {}).reduce(
                (result, [name, value]) => result.replace(`{{${name}}}`, value),
                template,
            );
        },
    }),
}));

vi.mock('@/i18n', () => ({
    default: { t: (key: string) => translations[key] ?? key },
}));

const sourceNode: Node = {
    id: 'source',
    type: 'timelineNode',
    position: { x: 0, y: 0 },
    selected: true,
    data: { type: 'event', label: 'Existing', date: '2026-08-01' },
};

const createContext = (nodes: Node[] = [sourceNode], edges: Edge[] = []): PluginContext => ({
    nodes,
    edges,
    getNodes: vi.fn(() => nodes),
    getEdges: vi.fn(() => edges),
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    takeSnapshot: vi.fn(),
    updateNodesBatch: vi.fn(),
    updateEdgesBatch: vi.fn(),
    addNode: vi.fn(() => 'added-node'),
});

const getCreationControls = (context: PluginContext): React.ReactNode => {
    const canvas = new TimelinePlugin().contributeCanvasComponents(context);
    if (!React.isValidElement<{ creationControls?: React.ReactNode }>(canvas)) return null;
    return canvas.props.creationControls;
};

describe('TimelinePlugin toolbar accessibility and history', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('opts out of React Flow chrome that conflicts with the timeline canvas', () => {
        const plugin = new TimelinePlugin();

        expect(plugin).toMatchObject({
            replacesDefaultCanvas: true,
            hideDefaultSidebar: true,
            hideContextToolbar: true,
            hideMiniMap: true,
            hideGridControls: true,
            hideLayoutControls: true,
            hideFlowFocusControls: true,
            hideZoomControls: true,
            hideCenterIsland: true,
        });
    });

    it('removes creation controls from the floating top toolbar', () => {
        const context = createContext();
        expect(new TimelinePlugin().contributeToolbar(context)).toBeNull();
    });

    it('passes the controlled plugin state into the replacement timeline canvas', () => {
        const context = createContext();
        const canvas = new TimelinePlugin().contributeCanvasComponents(context);

        expect(React.isValidElement<{ ctx?: PluginContext }>(canvas)).toBe(true);
        if (React.isValidElement<{ ctx?: PluginContext }>(canvas)) {
            expect(canvas.props.ctx).toBe(context);
        }
    });

    it('exposes creation as one compact menu inside the task header', async () => {
        const context = createContext();
        render(<>{getCreationControls(context)}</>);

        expect(screen.getByRole('button', { name: '新建时间线任务' })).toBeTruthy();
        expect(screen.queryByText('New event')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '新建时间线任务' }));

        expect(await screen.findByText('New event')).toBeTruthy();
        expect(screen.getByText('New phase')).toBeTruthy();
        expect(screen.getByText('New milestone')).toBeTruthy();
    });

    it('snapshots, localizes, selects, and confirms an appended event', async () => {
        const context = createContext();
        render(<>{getCreationControls(context)}</>);

        fireEvent.click(screen.getByRole('button', { name: '新建时间线任务' }));
        fireEvent.click(await screen.findByText('New event'));

        expect(context.takeSnapshot).toHaveBeenCalledTimes(1);
        expect(context.addNode).not.toHaveBeenCalled();

        const updateNodes = vi.mocked(context.setNodes).mock.calls[0]?.[0];
        expect(typeof updateNodes).toBe('function');
        if (typeof updateNodes === 'function') {
            const updatedNodes = updateNodes([sourceNode]);
            expect(updatedNodes[0]).toMatchObject({ id: 'source', selected: false });
            expect(updatedNodes[1]).toMatchObject({
                type: 'timelineNode',
                selected: true,
                data: { type: 'event', label: 'New event' },
            });
        }

        const updateEdges = vi.mocked(context.setEdges).mock.calls[0]?.[0];
        expect(typeof updateEdges).toBe('function');
        if (typeof updateEdges === 'function') {
            expect(updateEdges([])[0]).toMatchObject({
                source: 'source',
                target: expect.stringMatching(/^tl-node-/),
                type: 'smoothstep',
            });
        }
        expect(messageMocks.success).toHaveBeenCalledWith('New event added');
    });

    it('creates a zero-duration milestone when its menu item is clicked', async () => {
        const context = createContext();
        render(<>{getCreationControls(context)}</>);

        fireEvent.click(screen.getByRole('button', { name: '新建时间线任务' }));
        fireEvent.click(await screen.findByRole('menuitem', { name: 'New milestone' }));

        expect(context.takeSnapshot).toHaveBeenCalledTimes(1);
        const updateNodes = vi.mocked(context.setNodes).mock.calls[0]?.[0];
        expect(typeof updateNodes).toBe('function');
        if (typeof updateNodes === 'function') {
            const appended = updateNodes([sourceNode])[1];
            expect(appended).toMatchObject({
                type: 'timelineNode',
                selected: true,
                data: {
                    type: 'milestone',
                    label: 'New milestone',
                    status: 'pending',
                },
            });
            expect(appended.data.date).toBe(appended.data.endDate);
            expect(appended.data).not.toHaveProperty('progress');
        }

        const updateEdges = vi.mocked(context.setEdges).mock.calls[0]?.[0];
        expect(typeof updateEdges).toBe('function');
        if (typeof updateEdges === 'function') {
            expect(updateEdges([])[0]).toMatchObject({
                source: 'source',
                target: expect.stringMatching(/^tl-node-/),
                type: 'smoothstep',
            });
        }
        expect(messageMocks.success).toHaveBeenCalledWith('New milestone added');
    });

    it('keeps each toolbar action at the commercial touch target', () => {
        const css = readFileSync(resolve('src/core/plugins/TimelinePlugin.css'), 'utf8');
        expect(css).toMatch(/\.timeline-plugin-toolbar__action\.ant-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/\.timeline-plugin-toolbar__action\.ant-btn[\s\S]*?min-width: var\(--commercial-touch-target, 44px\)/);
    });
});
