// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mindHarness = vi.hoisted(() => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    return {
        listeners,
        addListener: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
        }),
        removeListener: vi.fn((event: string) => {
            listeners.delete(event);
        }),
        expandNode: vi.fn(),
        findEle: vi.fn((id: string) => ({ dataset: { nodeid: id } })),
        removeNodes: vi.fn(),
        reshapeNode: vi.fn(),
    };
});

vi.mock('../mindElixirStore', () => ({
    getMindElixirInstance: () => ({
        bus: {
            addListener: mindHarness.addListener,
            removeListener: mindHarness.removeListener,
        },
        expandNode: mindHarness.expandNode,
        findEle: mindHarness.findEle,
        removeNodes: mindHarness.removeNodes,
        reshapeNode: mindHarness.reshapeNode,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            if (!values) return key;
            return `${key} ${Object.values(values).join(' ')}`;
        },
    }),
}));

vi.mock('antd', () => ({
    Popconfirm: ({
        children,
        onConfirm,
    }: {
        children: React.ReactNode;
        onConfirm: () => void;
    }) => (
        <>
            {children}
            <button type="button" data-testid="confirm-batch-delete" onClick={onConfirm}>confirm</button>
        </>
    ),
    Popover: ({
        children,
        content,
        open,
    }: {
        children: React.ReactNode;
        content: React.ReactNode;
        open?: boolean;
    }) => <>{children}{open ? content : null}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import MindMapBatchBar from '../MindMapBatchBar';

const selectedNodes = [
    { id: 'node-1', topic: 'One' },
    { id: 'node-2', topic: 'Two' },
];

const selectBatch = () => {
    act(() => {
        mindHarness.listeners.get('selectNodes')?.(selectedNodes);
    });
};

describe('MindMapBatchBar commercial interactions', () => {
    beforeEach(() => {
        mindHarness.listeners.clear();
        mindHarness.addListener.mockClear();
        mindHarness.removeListener.mockClear();
        mindHarness.expandNode.mockClear();
        mindHarness.findEle.mockClear();
        mindHarness.removeNodes.mockClear();
        mindHarness.reshapeNode.mockClear();
    });

    it('renders only for a multi-selection and exposes a named native toolbar', () => {
        render(<MindMapBatchBar />);
        expect(screen.queryByRole('toolbar')).toBeNull();

        selectBatch();

        expect(screen.getByRole('toolbar', { name: 'plugins.mindmap.batch.toolbarLabel' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('plugins.mindmap.batch.selectedCount 2');
        expect(screen.getByRole('button', { name: 'plugins.mindmap.batch.color' }).tagName).toBe('BUTTON');
        expect(screen.getByRole('button', { name: 'plugins.mindmap.batch.expand' }).tagName).toBe('BUTTON');
        expect(screen.getByRole('button', { name: 'plugins.mindmap.batch.collapse' }).tagName).toBe('BUTTON');
        expect(screen.getByRole('button', { name: 'common.delete' }).tagName).toBe('BUTTON');
    });

    it('exposes the color palette with stable names and applies one sanitized color transaction', () => {
        render(<MindMapBatchBar />);
        selectBatch();

        const trigger = screen.getByRole('button', { name: 'plugins.mindmap.batch.color' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(trigger);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        fireEvent.click(screen.getByRole('button', {
            name: 'plugins.mindmap.batch.colorChoice #6366f1',
        }));

        expect(mindHarness.reshapeNode).toHaveBeenCalledTimes(2);
        expect(mindHarness.reshapeNode.mock.calls[0]?.[1]).toMatchObject({ branchColor: '#6366f1' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('runs expand, collapse, and confirmed deletion against every selected element', () => {
        render(<MindMapBatchBar />);
        selectBatch();

        fireEvent.click(screen.getByRole('button', { name: 'plugins.mindmap.batch.expand' }));
        fireEvent.click(screen.getByRole('button', { name: 'plugins.mindmap.batch.collapse' }));
        expect(mindHarness.expandNode.mock.calls.map(call => call[1])).toEqual([true, true, false, false]);

        fireEvent.click(screen.getByTestId('confirm-batch-delete'));
        expect(mindHarness.removeNodes).toHaveBeenCalledTimes(1);
        expect(mindHarness.removeNodes.mock.calls[0]?.[0]).toHaveLength(2);
        expect(screen.queryByRole('toolbar')).toBeNull();
    });

    it('cleans up listeners and hides the toolbar when the selection is cleared', () => {
        const { unmount } = render(<MindMapBatchBar />);
        selectBatch();

        act(() => {
            mindHarness.listeners.get('unselectNodes')?.();
        });
        expect(screen.queryByRole('toolbar')).toBeNull();

        unmount();
        expect(mindHarness.removeListener).toHaveBeenCalledWith('selectNodes', expect.any(Function));
        expect(mindHarness.removeListener).toHaveBeenCalledWith('unselectNodes', expect.any(Function));
    });
});
