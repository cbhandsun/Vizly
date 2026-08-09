// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProGanttTask } from '../../../../hooks/useProTimelineEngine';
import ProTaskListPanel from '../ProTaskListPanel';

vi.mock('@/core/themes/useCoreTheme', () => ({ useTheme: () => [null, vi.fn()] }));
vi.mock('@/core/hooks/useProTimelineEngine', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/core/hooks/useProTimelineEngine')>();
    return {
        ...original,
        useProTimelineEngine: () => ({ showBaseline: false }),
    };
});

const task: ProGanttTask = {
    id: 'launch',
    name: 'Project launch',
    startDate: '2026-08-08',
    endDate: '2026-08-10',
    type: 'phase',
    _computed: {
        laneIndex: 0,
        x: 0,
        w: 120,
        depth: 0,
        isVisible: true,
        hasChildren: false,
    },
};

const renderPanel = (onClickTask = vi.fn()) => render(
    <ProTaskListPanel
        tasks={[task]}
        width={380}
        onWidthChange={vi.fn()}
        hoveredTaskId={null}
        onHoverTask={vi.fn()}
        onClickTask={onClickTask}
        selectedTaskId={null}
        scrollTop={0}
        onScrollTopChange={vi.fn()}
    />,
);

describe('ProTaskListPanel accessibility', () => {
    it('exposes the task collection and descriptive selectable tasks', () => {
        renderPanel();

        expect(screen.getByRole('listbox', { name: '项目任务列表' })).toBeTruthy();
        const option = screen.getByRole('option', { name: /Project launch，开始 2026-08-08/ });
        expect(option.getAttribute('tabindex')).toBe('0');
        expect(option.getAttribute('aria-selected')).toBe('false');
    });

    it.each(['Enter', ' '])('selects a focused task with %j', (key) => {
        const onClickTask = vi.fn();
        renderPanel(onClickTask);

        const option = screen.getByRole('option', { name: /Project launch/ });
        fireEvent.keyDown(option, { key });

        expect(onClickTask).toHaveBeenCalledWith('launch');
    });

    it('does not select the task when a nested editor handles a key', () => {
        const onClickTask = vi.fn();
        renderPanel(onClickTask);

        const option = screen.getByRole('option', { name: /Project launch/ });
        fireEvent.doubleClick(screen.getByText('Project launch'));
        const editor = screen.getByDisplayValue('Project launch');
        fireEvent.keyDown(editor, { key: 'Enter' });

        expect(option.isConnected).toBe(true);
        expect(onClickTask).not.toHaveBeenCalled();
    });
});
