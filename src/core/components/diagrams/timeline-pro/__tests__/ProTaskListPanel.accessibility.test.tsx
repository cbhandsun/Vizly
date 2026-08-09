// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProGanttTask } from '../../../../hooks/useProTimelineEngine';
import { ProResourceDrawer } from '../ProResourceDrawer';
import ProTaskListPanel from '../ProTaskListPanel';
import {
    getResourceTaskAccessibleLabel,
    isResourceTaskActivationKey,
    shouldCloseResourceDrawerAfterFocus,
} from '../proResourceDrawerAccessibility';

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

vi.mock('@/core/themes/useCoreTheme', () => ({ useTheme: () => [null, vi.fn()] }));
vi.mock('@/core/hooks/useProTimelineEngine', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/core/hooks/useProTimelineEngine')>();
    return {
        ...original,
        useProTimelineEngine: () => ({
            showBaseline: false,
            setPan: vi.fn(),
            panY: 0,
            dateToX: () => 0,
        }),
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

describe('ProResourceDrawer task focus', () => {
    it('exposes resource tasks as descriptive keyboard actions', () => {
        const onTaskClick = vi.fn();
        const onClose = vi.fn();
        render(<ProResourceDrawer open onClose={onClose} tasks={[task]} onTaskClick={onTaskClick} />);

        const action = screen.getByRole('button', { name: '查看时间线任务 Project launch' });
        fireEvent.keyDown(action, { key: 'Enter' });

        expect(onTaskClick).toHaveBeenCalledWith('launch');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes the drawer after keyboard focus on a narrow viewport', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 577 });
        const onTaskClick = vi.fn();
        const onClose = vi.fn();
        render(<ProResourceDrawer open onClose={onClose} tasks={[task]} onTaskClick={onTaskClick} />);

        fireEvent.keyDown(screen.getByRole('button', { name: '查看时间线任务 Project launch' }), { key: ' ' });

        expect(onTaskClick).toHaveBeenCalledWith('launch');
        expect(onClose).toHaveBeenCalledTimes(1);
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    });
});

describe('resource drawer accessibility boundaries', () => {
    it.each([
        ['Enter', true],
        [' ', true],
        ['Escape', false],
        ['', false],
        [null, false],
    ])('classifies activation key %j', (value, expected) => {
        expect(isResourceTaskActivationKey(value)).toBe(expected);
    });

    it.each([
        [577, true],
        [768, true],
        [769, false],
        [Number.POSITIVE_INFINITY, false],
        [0, false],
        [-1, false],
        ['577', false],
        [undefined, false],
    ])('classifies viewport width %j', (value, expected) => {
        expect(shouldCloseResourceDrawerAfterFocus(value)).toBe(expected);
    });

    it('sanitizes missing task names in accessible labels', () => {
        expect(getResourceTaskAccessibleLabel('  Launch  ')).toBe('查看时间线任务 Launch');
        expect(getResourceTaskAccessibleLabel('   ')).toBe('查看时间线任务 未命名任务');
        expect(getResourceTaskAccessibleLabel(null)).toBe('查看时间线任务 未命名任务');
    });
});
