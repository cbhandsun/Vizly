// @vitest-environment jsdom
import React, { type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MindMapContextMenu from '../MindMapContextMenu';

const harness = vi.hoisted(() => {
    const child = { id: 'child', topic: 'Carrier plan', children: [{ id: 'leaf', topic: 'Dispatch' }] };
    const root = { id: 'root', topic: 'Root', children: [child] };
    return {
        child,
        root,
        topicElement: {},
        removeNodes: vi.fn(),
        selectNode: vi.fn(),
    };
});

vi.mock('../mindElixirStore', () => ({
    getMindElixirInstance: () => ({
        addChild: vi.fn(),
        copyNode: vi.fn(),
        editTopic: vi.fn(),
        expandNode: vi.fn(),
        findEle: (id: string) => id === harness.child.id ? harness.topicElement : null,
        getData: () => ({ nodeData: harness.root }),
        insertSibling: vi.fn(),
        moveDownNode: vi.fn(),
        moveUpNode: vi.fn(),
        removeNodes: harness.removeNodes,
        reshapeNode: vi.fn(),
        selectNode: harness.selectNode,
    }),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            const translations: Record<string, string> = {
                'common.cancel': 'Cancel',
                'plugins.mindmap.actions.collapse': 'Collapse',
                'plugins.mindmap.actions.contextMenuLabel': 'Node actions',
                'plugins.mindmap.actions.deleteNode': 'Delete node',
                'plugins.mindmap.actions.expand': 'Expand',
                'plugins.mindmap.nodeDelete.confirm': 'Delete node',
                'plugins.mindmap.nodeDelete.descriptionWithChildren': `Also deletes ${String(values?.count ?? 0)} descendants`,
                'plugins.mindmap.nodeDelete.failed': 'Could not delete',
                'plugins.mindmap.nodeDelete.success': 'Node deleted',
                'plugins.mindmap.nodeDelete.title': `Delete “${String(values?.topic ?? '')}”?`,
                'plugins.mindmap.nodeDelete.titleFallback': 'Delete this node?',
                'plugins.mindmap.nodeDelete.untitled': 'Untitled node',
            };
            return translations[key] ?? key;
        },
    }),
}));

vi.mock('antd', () => ({
    Alert: ({ message, role }: { message: ReactNode; role?: string }) => (
        <div role={role}>{message}</div>
    ),
    Modal: (props: {
        cancelText?: ReactNode;
        children?: ReactNode;
        onCancel?: () => void;
        onOk?: () => void;
        okText?: ReactNode;
        open?: boolean;
        title?: ReactNode;
    }) => props.open ? (
        <div role="dialog" aria-label={String(props.title ?? '')}>
            {props.children}
            <button type="button" onClick={props.onCancel}>{props.cancelText}</button>
            <button type="button" onClick={props.onOk}>{props.okText}</button>
        </div>
    ) : null,
}));

describe('MindMapContextMenu', () => {
    beforeEach(() => {
        harness.removeNodes.mockReset();
        harness.selectNode.mockReset();
    });

    it('opens as a named native menu and supports arrow, Home, and End navigation', async () => {
        render(
            <MindMapContextMenu
                visible
                x={20}
                y={20}
                nodeId={harness.child.id}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByRole('menu', { name: 'Node actions' })).toBeTruthy();
        const items = screen.getAllByRole('menuitem');
        await waitFor(() => expect(document.activeElement).toBe(items[0]));

        fireEvent.keyDown(items[0], { key: 'ArrowDown' });
        expect(document.activeElement).toBe(items[1]);
        fireEvent.keyDown(items[1], { key: 'End' });
        expect(document.activeElement).toBe(items[items.length - 1]);
        fireEvent.keyDown(items[items.length - 1], { key: 'Home' });
        expect(document.activeElement).toBe(items[0]);
        fireEvent.keyDown(items[0], { key: 'ArrowUp' });
        expect(document.activeElement).toBe(items[items.length - 1]);
    });

    it('keeps the menu mounted while confirming and deletes only the captured target', async () => {
        const onClose = vi.fn();
        const onCanvasClick = vi.fn();
        render(
            <div onClick={onCanvasClick} onMouseDown={onCanvasClick}>
                <MindMapContextMenu
                    visible
                    x={20}
                    y={20}
                    nodeId={harness.child.id}
                    onClose={onClose}
                />
            </div>,
        );

        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete node' }));
        expect(onCanvasClick).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Delete “Carrier plan”?' })).toBeTruthy();
        fireEvent.mouseDown(document.body);
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
        await waitFor(() => expect(harness.removeNodes).toHaveBeenCalledWith([harness.topicElement]));
        expect(harness.selectNode).toHaveBeenCalledWith(harness.topicElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
