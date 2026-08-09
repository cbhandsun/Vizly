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
import {
    getProTaskAccessibleName,
    getProTaskListKeyboardWidth,
    normalizeProTaskListWidth,
} from '../proTaskListInteraction';

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

const renderPanel = (overrides: Partial<React.ComponentProps<typeof ProTaskListPanel>> = {}) => render(
    <ProTaskListPanel
        tasks={[task]}
        width={380}
        onWidthChange={vi.fn()}
        hoveredTaskId={null}
        onHoverTask={vi.fn()}
        onClickTask={vi.fn()}
        selectedTaskId={null}
        scrollTop={0}
        onScrollTopChange={vi.fn()}
        {...overrides}
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
        renderPanel({ onClickTask });

        const option = screen.getByRole('option', { name: /Project launch/ });
        fireEvent.keyDown(option, { key });

        expect(onClickTask).toHaveBeenCalledWith('launch');
    });

    it('does not select the task when a nested editor handles a key', () => {
        const onClickTask = vi.fn();
        renderPanel({ onClickTask });

        const option = screen.getByRole('option', { name: /Project launch/ });
        fireEvent.doubleClick(screen.getByText('Project launch'));
        const editor = screen.getByDisplayValue('Project launch');
        fireEvent.keyDown(editor, { key: 'Enter' });

        expect(option.isConnected).toBe(true);
        expect(onClickTask).not.toHaveBeenCalled();
    });

    it('reveals descriptive add and delete actions when a task receives keyboard focus', () => {
        renderPanel();

        const option = screen.getByRole('option', { name: /Project launch/ });
        fireEvent.focus(option);

        expect(screen.getByRole('button', { name: '为 Project launch 添加子项' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '删除 Project launch 及其所有子任务' })).toBeTruthy();
    });

    it('edits the task name with F2 and labels the editor', () => {
        renderPanel();

        fireEvent.keyDown(screen.getByRole('option', { name: /Project launch/ }), { key: 'F2' });

        expect(screen.getByRole('textbox', { name: '编辑 Project launch 的任务名称' })).toBeTruthy();
    });

    it.each([
        ['ArrowLeft', true, true],
        ['ArrowRight', false, true],
    ])('uses %s to change an applicable hierarchy state', (key, expanded, expectedCall) => {
        const onTaskExpandToggle = vi.fn();
        renderPanel({
            tasks: [{ ...task, isExpanded: expanded, _computed: { ...task._computed!, hasChildren: true } }],
            onTaskExpandToggle,
        });

        const option = screen.getByRole('option', { name: /Project launch/ });
        fireEvent.keyDown(option, { key });

        expect(onTaskExpandToggle).toHaveBeenCalledTimes(expectedCall ? 1 : 0);
        expect(screen.getByRole('button', { name: `${expanded ? '收起' : '展开'}任务 Project launch` })).toBeTruthy();
    });

    it('exposes a keyboard-adjustable width separator', () => {
        const onWidthChange = vi.fn();
        renderPanel({ onWidthChange, width: 380 });

        const separator = screen.getByRole('separator', { name: '调整任务列表宽度' });
        expect(separator.getAttribute('aria-valuenow')).toBe('380');
        fireEvent.keyDown(separator, { key: 'ArrowRight' });
        expect(onWidthChange).toHaveBeenCalledWith(400);
    });

    it('requires confirmation before deleting a task', () => {
        const onTaskDelete = vi.fn();
        renderPanel({ onTaskDelete });
        fireEvent.focus(screen.getByRole('option', { name: /Project launch/ }));

        fireEvent.click(screen.getByRole('button', { name: '删除 Project launch 及其所有子任务' }));
        expect(onTaskDelete).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('删 除'));
        expect(onTaskDelete).toHaveBeenCalledWith('launch');
    });
});

describe('task list interaction boundaries', () => {
    it.each([
        [380, 380],
        [0, 280],
        [-1, 280],
        [9999, 650],
        [Number.POSITIVE_INFINITY, 380],
        ['380', 380],
        [undefined, 380],
    ])('normalizes width %j', (value, expected) => {
        expect(normalizeProTaskListWidth(value)).toBe(expected);
    });

    it.each([
        [380, 'ArrowLeft', 360],
        [380, 'ArrowRight', 400],
        [280, 'ArrowLeft', 280],
        [650, 'ArrowRight', 650],
        [380, 'Home', 280],
        [380, 'End', 650],
        [380, 'Escape', null],
        [undefined, null, null],
    ])('steps width %j with key %j', (width, key, expected) => {
        expect(getProTaskListKeyboardWidth(width, key)).toBe(expected);
    });

    it('sanitizes missing task names for action labels', () => {
        expect(getProTaskAccessibleName('  Launch  ')).toBe('Launch');
        expect(getProTaskAccessibleName('  ')).toBe('未命名任务');
        expect(getProTaskAccessibleName(null)).toBe('未命名任务');
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
