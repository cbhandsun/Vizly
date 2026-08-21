// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ProGanttTask } from '../../../../hooks/useProTimelineEngine';
import { ProResourceDrawer } from '../ProResourceDrawer';
import ProTaskListPanel from '../ProTaskListPanel';
import ProTaskLayer from '../ProTaskLayer';
import ProDependencyLayer from '../ProDependencyLayer';
import { ProTimelineChrome } from '../ProTimelineChrome';
import type { ProjectedProTimelineTask } from '../proTimelineTaskProjection';
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
import {
    getProTaskDateKeyboardDelta,
    getProTaskDependencyControlLeft,
    getProTaskLayerAccessibleName,
    getProTaskProgressKeyboardValue,
} from '../proTaskLayerInteraction';
import {
    validateProTimelineDependencyConnection,
    validateProTimelineDependencyUpdate,
} from '../proTimelineDependencyConnection';
import {
    getProTimelineDependencyAccessibleName,
    getProTimelineDependencyViewportAnchor,
    isProTimelineDependencyActivationKey,
    isProTimelineDependencyDeleteKey,
} from '../proTimelineDependencyInteraction';
import { requestProTimelineSnapshot } from '../proTimelineHistory';

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

beforeAll(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
});


vi.mock('@/core/themes/useCoreTheme', () => ({ useTheme: () => [null, vi.fn()] }));
vi.mock('@/core/hooks/useProTimelineEngine', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/core/hooks/useProTimelineEngine')>();
    return {
        ...original,
        useProTimelineEngine: () => ({
            showBaseline: false,
            showCriticalPath: false,
            setPan: vi.fn(),
            panY: 0,
            dateToX: () => 0,
            xToDate: () => '2026-08-10',
            pixelsPerDay: 20,
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

const renderTimelineChrome = (
    overrides: Partial<React.ComponentProps<typeof ProTimelineChrome>> = {},
) => render(
    <ProTimelineChrome
        borderColor="#ddd"
        glassBackground="#fff"
        shadowColor="rgba(0, 0, 0, 0.1)"
        secondaryTextColor="#666"
        showResourceDrawer={false}
        onOpenResourceDrawer={vi.fn()}
        showCriticalPath={false}
        criticalPathUnavailableReason={undefined}
        onToggleCriticalPath={vi.fn()}
        showBaseline={false}
        hasBaseline={false}
        onToggleBaseline={vi.fn()}
        onSaveBaseline={vi.fn()}
        onClearBaseline={vi.fn()}
        viewMode="day"
        onViewModeChange={vi.fn()}
        zoomLevel={1}
        onZoomChange={vi.fn()}
        {...overrides}
    />,
);

describe('ProTimelineChrome baseline availability', () => {
    it('disables comparison and clearing until a baseline exists', () => {
        const onToggleBaseline = vi.fn();
        const onClearBaseline = vi.fn();
        renderTimelineChrome({ onToggleBaseline, onClearBaseline });

        const comparison = screen.getByRole('switch', { name: '显示基线对比' });
        const clear = screen.getByRole('button', { name: '清空排期基线' });
        expect(comparison).toHaveProperty('disabled', true);
        expect(clear).toHaveProperty('disabled', true);

        fireEvent.click(comparison);
        fireEvent.click(clear);
        expect(onToggleBaseline).not.toHaveBeenCalled();
        expect(onClearBaseline).not.toHaveBeenCalled();
    });

    it('enables baseline actions after a valid snapshot exists', () => {
        const onToggleBaseline = vi.fn();
        const onClearBaseline = vi.fn();
        renderTimelineChrome({ hasBaseline: true, onToggleBaseline, onClearBaseline });

        fireEvent.click(screen.getByRole('switch', { name: '显示基线对比' }));
        fireEvent.click(screen.getByRole('button', { name: '清空排期基线' }));

        expect(onToggleBaseline).toHaveBeenCalledTimes(1);
        expect(onClearBaseline).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: '保存当前排期为基线' }));
    });
});

describe('ProTimelineChrome critical path availability', () => {
    it('disables an unavailable analysis instead of accepting an action with no result', () => {
        const onToggleCriticalPath = vi.fn();
        renderTimelineChrome({
            criticalPathUnavailableReason: '请先添加至少一个排期任务',
            onToggleCriticalPath,
        });

        const criticalPath = screen.getByRole('switch', { name: '显示关键路径' });
        expect(criticalPath).toHaveProperty('disabled', true);

        fireEvent.click(criticalPath);
        expect(onToggleCriticalPath).not.toHaveBeenCalled();
    });
});

describe('ProTaskListPanel accessibility', () => {
    it('exposes the task collection and descriptive selectable tasks', () => {
        renderPanel();

        expect(screen.getByRole('listbox', { name: '项目任务列表' })).toBeTruthy();
        expect(screen.getByRole('listbox', { name: '项目任务列表' }).getAttribute('aria-multiselectable')).toBe('true');
        const option = screen.getByRole('option', { name: /Project launch，开始 2026-08-08/ });
        expect(option.getAttribute('tabindex')).toBe('0');
        expect(option.getAttribute('aria-selected')).toBe('false');
    });

    it.each(['Enter', ' '])('selects a focused task with %j', (key) => {
        const onClickTask = vi.fn();
        renderPanel({ onClickTask });

        const option = screen.getByRole('option', { name: /Project launch/ });
        fireEvent.keyDown(option, { key });

        expect(onClickTask).toHaveBeenCalledWith('launch', false);
    });

    it('announces and preserves additive pointer and keyboard selection', () => {
        const onClickTask = vi.fn();
        renderPanel({ onClickTask, selectedTaskIds: new Set(['launch']) });
        const option = screen.getByRole('option', { name: /Project launch/ });

        expect(option.getAttribute('aria-selected')).toBe('true');
        fireEvent.click(option, { ctrlKey: true });
        fireEvent.keyDown(option, { key: 'Enter', metaKey: true });

        expect(onClickTask).toHaveBeenNthCalledWith(1, 'launch', true);
        expect(onClickTask).toHaveBeenNthCalledWith(2, 'launch', true);
    });

    it('dispatches one recoverable snapshot request before a timeline mutation', () => {
        const onSnapshot = vi.fn();
        window.addEventListener('diagram:save-snapshot', onSnapshot);

        requestProTimelineSnapshot(window);

        expect(onSnapshot).toHaveBeenCalledTimes(1);
        window.removeEventListener('diagram:save-snapshot', onSnapshot);
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

    it('preserves the task name and keyboard focus through an F2 edit cancellation', () => {
        renderPanel();

        const option = screen.getByRole('option', { name: /Project launch/ });
        option.focus();
        fireEvent.keyDown(option, { key: 'F2' });

        const editor = screen.getByRole('textbox', { name: '编辑 Project launch 的任务名称' });
        expect(editor).toHaveProperty('value', 'Project launch');
        expect(editor).toHaveProperty('selectionStart', 0);
        expect(editor).toHaveProperty('selectionEnd', 'Project launch'.length);

        fireEvent.keyDown(editor, { key: 'Escape' });

        expect(document.activeElement).toBe(option);
        expect(screen.queryByRole('textbox', { name: '编辑 Project launch 的任务名称' })).toBeNull();
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

    it('uses an accessible recoverable confirmation before deleting a task', async () => {
        const onTaskDelete = vi.fn();
        const childTask: ProGanttTask = {
            ...task,
            id: 'child',
            name: 'Release gate',
            parentId: 'launch',
        };
        renderPanel({
            edges: [{ id: 'launch-child', source: 'launch', target: 'child' }],
            onTaskDelete,
            tasks: [task, childTask],
        });
        fireEvent.focus(screen.getByRole('option', { name: /Project launch/ }));

        fireEvent.click(screen.getByRole('button', { name: '删除 Project launch 及其所有子任务' }));
        expect(onTaskDelete).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toContain('删除后可使用撤销恢复');
        expect(dialog.textContent).toContain('将删除的任务2');
        expect(dialog.textContent).toContain('将删除的依赖关系1');
        expect(dialog.textContent).toContain('Release gate');
        const confirmButton = screen.getByRole('button', { name: /^删\s*除$/ });
        expect(confirmButton.classList.contains('ant-btn-primary')).toBe(true);
        expect(confirmButton.classList.contains('ant-btn-dangerous')).toBe(true);
        fireEvent.click(confirmButton);
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

const phaseLayerTask: ProjectedProTimelineTask = {
    id: 'phase-1',
    name: 'Launch phase',
    startDate: '2026-08-10',
    endDate: '2026-08-14',
    progress: 40,
    type: 'phase',
    _computed: {
        laneIndex: 0,
        x: 100,
        w: 100,
        depth: 0,
        isVisible: true,
        hasChildren: false,
    },
};

const eventLayerTask: ProjectedProTimelineTask = {
    ...phaseLayerTask,
    id: 'event-1',
    name: 'Design review',
    type: 'event',
    _computed: { ...phaseLayerTask._computed!, laneIndex: 1, x: 220 },
};

const milestoneLayerTask: ProjectedProTimelineTask = {
    ...phaseLayerTask,
    id: 'milestone-1',
    name: 'Release gate',
    type: 'milestone',
    _computed: { ...phaseLayerTask._computed!, laneIndex: 2, x: 360, w: 12 },
};

const summaryLayerTask: ProjectedProTimelineTask = {
    ...phaseLayerTask,
    id: 'summary-1',
    name: 'Program summary',
    type: 'summary',
    _computed: { ...phaseLayerTask._computed!, laneIndex: 3, x: 80 },
};

const renderTaskLayer = (overrides: Partial<React.ComponentProps<typeof ProTaskLayer>> = {}) => render(
    <ProTaskLayer tasks={[phaseLayerTask]} hoveredTaskId={null} {...overrides} />,
);

describe('ProTaskLayer accessibility and recovery', () => {
    it('exposes semantic dependency actions for task types that can be connected', () => {
        renderTaskLayer({
            tasks: [phaseLayerTask, eventLayerTask, milestoneLayerTask, summaryLayerTask],
            onTaskConnect: vi.fn(),
        });

        expect(screen.getByRole('button', { name: '从 Launch phase 创建依赖' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '从 Design review 创建依赖' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '从 Release gate 创建依赖' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '从 Program summary 创建依赖' })).toBeNull();
    });

    it('creates a dependency with C, target navigation, and Enter', () => {
        const onTaskConnect = vi.fn().mockReturnValue({ ok: true as const });
        renderTaskLayer({ tasks: [phaseLayerTask, eventLayerTask, milestoneLayerTask], onTaskConnect });
        const source = screen.getByRole('group', { name: 'Launch phase，时间轴任务' });

        fireEvent.keyDown(source, { key: 'c' });
        expect(source.getAttribute('data-connection-source')).toBe('true');
        expect(screen.getByRole('group', { name: 'Design review，时间轴任务' }).getAttribute('data-connection-target')).toBe('true');
        expect(screen.getByRole('status').textContent).toContain('使用上下方向键选择');

        fireEvent.keyDown(source, { key: 'ArrowDown' });
        expect(screen.getByRole('group', { name: 'Release gate，时间轴任务' }).getAttribute('data-connection-target')).toBe('true');
        fireEvent.keyDown(source, { key: 'Enter' });

        expect(onTaskConnect).toHaveBeenCalledWith('phase-1', 'milestone-1');
        expect(source.getAttribute('data-connection-source')).toBeNull();
        expect(screen.getByRole('status').textContent).toContain('已创建从 Launch phase 到 Release gate');
    });

    it('continues the keyboard workflow from the focused dependency button', () => {
        const onTaskConnect = vi.fn().mockReturnValue({ ok: true as const });
        renderTaskLayer({ tasks: [phaseLayerTask, eventLayerTask, milestoneLayerTask], onTaskConnect });
        const control = screen.getByRole('button', { name: '从 Launch phase 创建依赖' });

        fireEvent.click(control);
        const activeControl = screen.getByRole('button', { name: '取消从 Launch phase 创建依赖' });
        fireEvent.keyDown(activeControl, { key: 'End' });
        fireEvent.keyDown(activeControl, { key: 'Enter' });

        expect(onTaskConnect).toHaveBeenCalledWith('phase-1', 'milestone-1');
        expect(screen.getByRole('status').textContent).toContain('已创建从 Launch phase 到 Release gate');
    });

    it('opens guided dependency creation when the pointer clicks without dragging', () => {
        const onTaskConnect = vi.fn().mockReturnValue({ ok: true as const });
        const { container } = renderTaskLayer({
            tasks: [phaseLayerTask, eventLayerTask],
            onTaskConnect,
        });
        const control = screen.getByRole('button', { name: '从 Launch phase 创建依赖' });
        const interactionRoot = container.firstElementChild;
        expect(interactionRoot).not.toBeNull();

        fireEvent.pointerDown(control, { pointerId: 1, clientX: 200, clientY: 80 });
        fireEvent.pointerUp(interactionRoot as Element, { pointerId: 1, clientX: 202, clientY: 81 });

        expect(screen.getByRole('button', { name: '取消从 Launch phase 创建依赖' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('当前后置任务 Design review');
        expect(onTaskConnect).not.toHaveBeenCalled();
    });

    it('does not advertise dependency controls without a connection handler', () => {
        renderTaskLayer({ tasks: [phaseLayerTask, eventLayerTask] });

        expect(screen.queryByRole('button', { name: /从 Launch phase 创建依赖/ })).toBeNull();
    });

    it('cancels dependency creation without mutating edges', () => {
        const onTaskConnect = vi.fn();
        renderTaskLayer({ tasks: [phaseLayerTask, eventLayerTask], onTaskConnect });
        const source = screen.getByRole('group', { name: 'Launch phase，时间轴任务' });

        fireEvent.keyDown(source, { key: 'C' });
        fireEvent.keyDown(source, { key: 'Escape' });

        expect(onTaskConnect).not.toHaveBeenCalled();
        expect(source.getAttribute('data-connection-source')).toBeNull();
        expect(screen.getByRole('status').textContent).toContain('已取消创建依赖关系');
    });

    it('keeps connection mode recoverable after validation rejects a target', () => {
        const onTaskConnect = vi.fn().mockReturnValue({
            ok: false as const,
            code: 'reverse-time' as const,
            message: '依赖校验失败：时间顺序无效。',
        });
        renderTaskLayer({ tasks: [phaseLayerTask, eventLayerTask], onTaskConnect });
        const source = screen.getByRole('group', { name: 'Launch phase，时间轴任务' });

        fireEvent.keyDown(source, { key: 'c' });
        fireEvent.keyDown(source, { key: 'Enter' });

        expect(source.getAttribute('data-connection-source')).toBe('true');
        expect(screen.getByRole('status').textContent).toContain('请选择其他任务');
        fireEvent.keyDown(source, { key: 'Escape' });
        expect(source.getAttribute('data-connection-source')).toBeNull();
    });

    it.each(['Enter', ' '])('selects a timeline task with %j', (key) => {
        const onTaskClick = vi.fn();
        renderTaskLayer({ onTaskClick });
        const taskBar = screen.getByRole('group', { name: 'Launch phase，时间轴任务' });

        expect(taskBar.getAttribute('tabindex')).toBe('0');
        fireEvent.keyDown(taskBar, { key });

        expect(onTaskClick).toHaveBeenCalledWith('phase-1', false);
    });

    it('supports additive task-bar selection by pointer and keyboard', () => {
        const onTaskClick = vi.fn();
        renderTaskLayer({ onTaskClick });
        const taskBar = screen.getByRole('group', { name: 'Launch phase，时间轴任务' });

        fireEvent.click(taskBar, { ctrlKey: true });
        fireEvent.keyDown(taskBar, { key: 'Enter', metaKey: true });

        expect(onTaskClick).toHaveBeenNthCalledWith(1, 'phase-1', true);
        expect(onTaskClick).toHaveBeenNthCalledWith(2, 'phase-1', true);
    });

    it('opens a labeled editor with F2 and cancels without persisting', () => {
        const onTaskUpdate = vi.fn();
        renderTaskLayer({ onTaskUpdate });
        fireEvent.keyDown(screen.getByRole('group', { name: 'Launch phase，时间轴任务' }), { key: 'F2' });
        const editor = screen.getByRole('textbox', { name: '编辑 Launch phase 的任务名称' });

        fireEvent.change(editor, { target: { value: 'Changed name' } });
        fireEvent.keyDown(editor, { key: 'Escape' });

        expect(onTaskUpdate).not.toHaveBeenCalled();
        expect(screen.queryByRole('textbox', { name: '编辑 Launch phase 的任务名称' })).toBeNull();
    });

    it('trims and commits a task name with Enter', () => {
        const onTaskUpdate = vi.fn();
        renderTaskLayer({ onTaskUpdate });
        fireEvent.keyDown(screen.getByRole('group', { name: 'Launch phase，时间轴任务' }), { key: 'F2' });
        const editor = screen.getByRole('textbox', { name: '编辑 Launch phase 的任务名称' });

        fireEvent.change(editor, { target: { value: '  Ready to ship  ' } });
        fireEvent.keyDown(editor, { key: 'Enter' });

        expect(onTaskUpdate).toHaveBeenCalledWith('phase-1', { name: 'Ready to ship' });
    });

    it.each([
        ['ArrowRight', false, '2026-08-11', '2026-08-17'],
        ['ArrowLeft', true, '2026-08-03', '2026-08-07'],
    ])('moves a task with %s (shift=%s)', (key, shiftKey, expectedStart, expectedEnd) => {
        const onTaskDragEnd = vi.fn();
        renderTaskLayer({ onTaskDragEnd });

        fireEvent.keyDown(screen.getByRole('group', { name: 'Launch phase，时间轴任务' }), { key, shiftKey });

        expect(onTaskDragEnd).toHaveBeenCalledWith('phase-1', expectedStart, expectedEnd);
    });

    it.each([
        ['ArrowRight', false, 45],
        ['ArrowLeft', true, 30],
        ['Home', false, 0],
        ['End', false, 100],
    ])('adjusts progress with %s (shift=%s)', (key, shiftKey, expected) => {
        const onTaskUpdate = vi.fn();
        renderTaskLayer({ onTaskUpdate });
        const slider = screen.getByRole('slider', { name: '调整 Launch phase 的进度' });

        expect(slider.getAttribute('aria-valuenow')).toBe('40');
        fireEvent.keyDown(slider, { key, shiftKey });

        expect(onTaskUpdate).toHaveBeenCalledWith('phase-1', { progress: expected });
    });

    it.each([
        ['ArrowLeft', false, '2026-08-13'],
        ['ArrowRight', true, '2026-08-21'],
    ])('adjusts duration with %s (shift=%s)', (key, shiftKey, expectedEnd) => {
        const onTaskDragEnd = vi.fn();
        renderTaskLayer({ onTaskDragEnd });
        const handle = screen.getByRole('button', { name: '调整 Launch phase 的工期，当前 5 个工作日' });

        fireEvent.keyDown(handle, { key, shiftKey });

        expect(onTaskDragEnd).toHaveBeenCalledWith('phase-1', '2026-08-10', expectedEnd);
    });

    it('does not commit a pointer drag after the browser cancels it', () => {
        const onTaskDragEnd = vi.fn();
        const { container } = renderTaskLayer({ onTaskDragEnd });
        const taskBar = screen.getByRole('group', { name: 'Launch phase，时间轴任务' });
        const interactionRoot = container.firstElementChild;
        expect(interactionRoot).not.toBeNull();

        fireEvent.pointerDown(taskBar, { pointerId: 1, clientX: 100, clientY: 80 });
        fireEvent.pointerMove(interactionRoot as Element, { pointerId: 1, clientX: 180, clientY: 80 });
        fireEvent.pointerCancel(interactionRoot as Element, { pointerId: 1 });
        fireEvent.pointerUp(interactionRoot as Element, { pointerId: 1, clientX: 180, clientY: 80 });

        expect(onTaskDragEnd).not.toHaveBeenCalled();
    });

    it('keeps invalid schedules inert instead of coercing them to today', () => {
        const onTaskDragEnd = vi.fn();
        renderTaskLayer({
            tasks: [{ ...phaseLayerTask, name: ' ', startDate: '', endDate: '' }],
            onTaskDragEnd,
        });

        fireEvent.keyDown(screen.getByRole('group', { name: '未命名任务，时间轴任务' }), { key: 'ArrowRight' });

        expect(onTaskDragEnd).not.toHaveBeenCalled();
    });
});

const renderDependencyLayer = (
    overrides: Partial<React.ComponentProps<typeof ProDependencyLayer>> = {},
) => render(
    <ProDependencyLayer
        tasks={[
            phaseLayerTask,
            eventLayerTask,
            { ...milestoneLayerTask, dependencies: ['phase-1'] },
        ]}
        hoveredTaskId={null}
        onDeleteDependency={vi.fn().mockReturnValue({ ok: true as const })}
        onUpdateDependency={vi.fn().mockReturnValue({ ok: true as const })}
        {...overrides}
    />,
);

describe('ProDependencyLayer management and recovery', () => {
    it('exposes each dependency as a named keyboard action before showing destructive controls', () => {
        renderDependencyLayer();

        const dependency = screen.getByRole('button', { name: '依赖：Launch phase → Release gate' });
        expect(dependency.getAttribute('tabindex')).toBe('0');
        expect(dependency.getAttribute('aria-pressed')).toBe('false');
        expect(screen.queryByRole('button', { name: '删除依赖：Launch phase → Release gate' })).toBeNull();

        fireEvent.focus(dependency);
        expect(dependency.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('group', { name: '编辑依赖：Launch phase → Release gate' })).toBeTruthy();
    });

    it('keeps legacy summary endpoints named while excluding other summaries from new choices', () => {
        renderDependencyLayer({
            tasks: [
                summaryLayerTask,
                { ...phaseLayerTask, dependencies: ['summary-1'] },
                { ...summaryLayerTask, id: 'other-summary', name: 'Other summary' },
            ],
        });
        fireEvent.focus(screen.getByRole('button', { name: '依赖：Program summary → Launch phase' }));

        expect(screen.getByRole('button', { name: '删除依赖：Program summary → Launch phase' })).toBeTruthy();
        const source = screen.getByRole('combobox', { name: '前置任务' }) as HTMLSelectElement;
        expect(source.value).toBe('summary-1');
        expect(Array.from(source.options).map((option) => option.value)).not.toContain('other-summary');
    });

    it('edits both dependency endpoints through validated task choices', () => {
        const onUpdateDependency = vi.fn().mockReturnValue({ ok: true as const });
        renderDependencyLayer({ onUpdateDependency });
        fireEvent.click(screen.getByRole('button', { name: '依赖：Launch phase → Release gate' }));

        fireEvent.change(screen.getByRole('combobox', { name: '前置任务' }), {
            target: { value: 'event-1' },
        });
        fireEvent.change(screen.getByRole('combobox', { name: '后置任务' }), {
            target: { value: 'phase-1' },
        });
        fireEvent.click(screen.getByRole('button', { name: '应用更改' }));

        expect(onUpdateDependency).toHaveBeenCalledWith(
            'phase-1',
            'milestone-1',
            'event-1',
            'phase-1',
        );
        expect(screen.getByRole('status').textContent).toContain('依赖关系已更新');
    });

    it('keeps invalid edits open with a visible recovery message', () => {
        const onUpdateDependency = vi.fn().mockReturnValue({
            ok: false as const,
            code: 'cyclic-dependency' as const,
            message: '依赖校验失败：该连接会形成循环依赖。',
        });
        renderDependencyLayer({ onUpdateDependency });
        fireEvent.focus(screen.getByRole('button', { name: '依赖：Launch phase → Release gate' }));
        fireEvent.change(screen.getByRole('combobox', { name: '后置任务' }), {
            target: { value: 'event-1' },
        });
        fireEvent.click(screen.getByRole('button', { name: '应用更改' }));

        expect(screen.getByRole('group', { name: '编辑依赖：Launch phase → Release gate' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('形成循环依赖');
        expect(screen.getByRole('status').textContent).toContain('调整后重试');
    });

    it('deletes only after selection and supports the standard Delete shortcut', () => {
        const onDeleteDependency = vi.fn().mockReturnValue({ ok: true as const });
        renderDependencyLayer({ onDeleteDependency });
        const dependency = screen.getByRole('button', { name: '依赖：Launch phase → Release gate' });

        fireEvent.keyDown(dependency, { key: 'Delete' });

        expect(onDeleteDependency).toHaveBeenCalledWith('phase-1', 'milestone-1');
        expect(screen.getByRole('status').textContent).toContain('可使用撤销恢复');
    });

    it('closes dependency editing with Escape without mutating data', () => {
        const onDeleteDependency = vi.fn();
        const onUpdateDependency = vi.fn();
        renderDependencyLayer({ onDeleteDependency, onUpdateDependency });
        const dependency = screen.getByRole('button', { name: '依赖：Launch phase → Release gate' });

        fireEvent.focus(dependency);
        fireEvent.keyDown(screen.getByRole('group', { name: '编辑依赖：Launch phase → Release gate' }), {
            key: 'Escape',
        });

        expect(screen.queryByRole('group', { name: '编辑依赖：Launch phase → Release gate' })).toBeNull();
        expect(onDeleteDependency).not.toHaveBeenCalled();
        expect(onUpdateDependency).not.toHaveBeenCalled();
    });
});

describe('task layer interaction boundaries', () => {
    it.each([
        ['ArrowLeft', false, -1],
        ['ArrowRight', false, 1],
        ['ArrowRight', true, 5],
        ['Escape', false, null],
        [null, false, null],
    ])('maps date key %j (shift=%s)', (key, shiftKey, expected) => {
        expect(getProTaskDateKeyboardDelta(key, shiftKey)).toBe(expected);
    });

    it.each([
        [40, 'ArrowRight', false, 45],
        [40, 'ArrowLeft', true, 30],
        [-50, 'ArrowLeft', false, 0],
        [999, 'ArrowRight', false, 100],
        [Number.NaN, 'Home', false, 0],
        [undefined, 'Escape', false, null],
    ])('normalizes progress %j with %j', (current, key, shiftKey, expected) => {
        expect(getProTaskProgressKeyboardValue(current, key, shiftKey)).toBe(expected);
    });

    it('sanitizes task names used by assistive technology', () => {
        expect(getProTaskLayerAccessibleName('  Launch  ')).toBe('Launch');
        expect(getProTaskLayerAccessibleName('  ')).toBe('未命名任务');
        expect(getProTaskLayerAccessibleName(null)).toBe('未命名任务');
    });

    it.each([
        ['phase', 100, 80, 184],
        ['event', 100, 12, 288],
        ['milestone', 100, 12, 58],
        ['milestone', 20, 12, 0],
        ['phase', Number.NaN, Number.POSITIVE_INFINITY, 12],
    ])('places %s dependency controls beside the rendered task', (type, x, width, expected) => {
        expect(getProTaskDependencyControlLeft(type, x, width)).toBe(expected);
    });
});

describe('dependency interaction boundaries', () => {
    it('sanitizes names used in dependency actions', () => {
        expect(getProTimelineDependencyAccessibleName('  Source   task ', null))
            .toBe('依赖：Source task → 未命名任务');
    });

    it.each([
        ['Enter', true],
        [' ', true],
        ['Delete', false],
        [null, false],
    ])('classifies activation key %j', (key, expected) => {
        expect(isProTimelineDependencyActivationKey(key)).toBe(expected);
    });

    it.each([
        ['Delete', true],
        ['Backspace', true],
        ['Enter', false],
        [undefined, false],
    ])('classifies delete key %j', (key, expected) => {
        expect(isProTimelineDependencyDeleteKey(key)).toBe(expected);
    });

    it('keeps the viewport toolbar inside narrow and malformed boundaries', () => {
        expect(getProTimelineDependencyViewportAnchor(
            { left: 560, top: 1_100, width: 20, height: 12 },
            577,
            1_113,
        )).toEqual({ left: 385, top: 853 });
        expect(getProTimelineDependencyViewportAnchor(
            { left: Number.NaN, top: Number.NEGATIVE_INFINITY, width: -10, height: Number.NaN },
            '577',
            null,
        )).toEqual({ left: 640, top: 372 });
    });
});

describe('timeline dependency validation boundaries', () => {
    const dependencyTasks = [
        { id: 'source', startDate: '2026-08-01', endDate: '2026-08-05' },
        { id: 'target', startDate: '2026-08-05', endDate: '2026-08-10' },
        { id: 'later', startDate: '2026-08-12', endDate: '2026-08-14' },
    ];
    const validate = (
        sourceId: string,
        targetId: string,
        edges: { source?: unknown; target?: unknown }[] = [],
        taskInputs = dependencyTasks,
    ) => validateProTimelineDependencyConnection({ sourceId, targetId, edges, tasks: taskInputs });

    it('accepts a chronological dependency, including an equal handoff date', () => {
        expect(validate('source', 'target')).toEqual({ ok: true });
    });

    it.each([
        ['missing', 'target', 'missing-task'],
        ['source', 'source', 'self-dependency'],
    ])('rejects invalid identities %s → %s', (sourceId, targetId, code) => {
        expect(validate(sourceId, targetId)).toMatchObject({ ok: false, code });
    });

    it('rejects duplicate dependencies before mutating state', () => {
        expect(validate('source', 'target', [{ source: 'source', target: 'target' }]))
            .toMatchObject({ ok: false, code: 'duplicate-dependency' });
    });

    it.each([
        [[{ id: 'source', startDate: '2026-08-01', endDate: '' }, dependencyTasks[1]], 'invalid-source-date'],
        [[dependencyTasks[0], { id: 'target', startDate: 'not-a-date', endDate: '2026-08-10' }], 'invalid-target-date'],
    ])('rejects invalid schedule boundaries', (taskInputs, code) => {
        expect(validate('source', 'target', [], taskInputs)).toMatchObject({ ok: false, code });
    });

    it('rejects a dependency that travels backward in time', () => {
        expect(validate('later', 'target')).toMatchObject({ ok: false, code: 'reverse-time' });
    });

    it('rejects direct and transitive cycles while ignoring malformed edges', () => {
        expect(validate('source', 'later', [
            { source: 'target', target: 'source' },
            { source: 'later', target: 'target' },
            { source: null, target: 'source' },
        ])).toMatchObject({ ok: false, code: 'cyclic-dependency' });
    });

    it('handles a deep dependency graph without recursive stack growth', () => {
        const deepTasks = Array.from({ length: 5_002 }, (_, index) => ({
            id: `task-${index}`,
            startDate: '2026-08-05',
            endDate: '2026-08-05',
        }));
        const deepEdges = deepTasks.slice(0, -1).map((dependencyTask, index) => ({
            source: dependencyTask.id,
            target: deepTasks[index + 1].id,
        }));

        expect(validateProTimelineDependencyConnection({
            sourceId: deepTasks.at(-1)!.id,
            targetId: deepTasks[0].id,
            tasks: deepTasks,
            edges: deepEdges,
        })).toMatchObject({ ok: false, code: 'cyclic-dependency' });
    });

    it('validates dependency edits after removing only the original edge', () => {
        expect(validateProTimelineDependencyUpdate({
            oldSourceId: 'source',
            oldTargetId: 'target',
            sourceId: 'source',
            targetId: 'later',
            tasks: dependencyTasks,
            edges: [
                { source: 'source', target: 'target' },
                { source: 'target', target: 'later' },
            ],
        })).toEqual({ ok: true });
    });

    it.each([
        [
            { oldSourceId: 'missing', oldTargetId: 'target', sourceId: 'source', targetId: 'later' },
            [{ source: 'source', target: 'target' }],
            'missing-dependency',
        ],
        [
            { oldSourceId: 'source', oldTargetId: 'target', sourceId: 'source', targetId: 'later' },
            [
                { source: 'source', target: 'target' },
                { source: 'source', target: 'later' },
            ],
            'duplicate-dependency',
        ],
        [
            { oldSourceId: 'source', oldTargetId: 'target', sourceId: 'later', targetId: 'source' },
            [
                { source: 'source', target: 'target' },
                { source: 'target', target: 'later' },
            ],
            'reverse-time',
        ],
    ])('rejects unsafe dependency edits with %s', (ids, edges, code) => {
        expect(validateProTimelineDependencyUpdate({ ...ids, tasks: dependencyTasks, edges }))
            .toMatchObject({ ok: false, code });
    });
});
