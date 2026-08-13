// @vitest-environment jsdom
import React, { type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NodeObj, Topic } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';
import {
    countMindMapDescendants,
    useMindMapNodeDeletion,
} from '../useMindMapNodeDeletion';

const bridge = vi.hoisted(() => ({
    error: vi.fn(),
    success: vi.fn(),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: bridge,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            const translations: Record<string, string> = {
                'common.cancel': 'Cancel',
                'plugins.mindmap.nodeDelete.title': `Delete “${String(values?.topic ?? '')}”?`,
                'plugins.mindmap.nodeDelete.titleFallback': 'Delete this node?',
                'plugins.mindmap.nodeDelete.untitled': 'Untitled node',
                'plugins.mindmap.nodeDelete.description': 'This removes the node. You can undo this action.',
                'plugins.mindmap.nodeDelete.descriptionWithChildren': `This also removes ${String(values?.count ?? 0)} descendant nodes. You can undo this action.`,
                'plugins.mindmap.nodeDelete.confirm': 'Delete node',
                'plugins.mindmap.nodeDelete.success': 'Node deleted',
                'plugins.mindmap.nodeDelete.failed': 'The node could not be deleted. Check that it still exists and try again.',
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
        afterClose?: () => void;
        cancelText?: ReactNode;
        children?: ReactNode;
        confirmLoading?: boolean;
        onCancel?: () => void;
        onOk?: () => void;
        okText?: ReactNode;
        open?: boolean;
        title?: ReactNode;
    }) => props.open ? (
        <div role="dialog" aria-label={String(props.title ?? '')}>
            {props.children}
            <button type="button" disabled={props.confirmLoading} onClick={() => {
                props.onCancel?.();
                props.afterClose?.();
            }}>{props.cancelText}</button>
            <button type="button" disabled={props.confirmLoading} onClick={props.onOk}>
                {props.okText}
            </button>
        </div>
    ) : null,
}));

const childNode: NodeObj = {
    id: 'child',
    topic: 'Carrier plan',
    children: [{ id: 'grandchild', topic: 'Dispatch' }],
};

const rootNode: NodeObj = {
    id: 'root',
    topic: 'Root',
    children: [childNode],
};

const createMind = (removeNodes = vi.fn()) => {
    const topicElement = document.createElement('div') as unknown as Topic;
    return {
        mind: {
            findEle: vi.fn((id: string) => id === childNode.id ? topicElement : null),
            getData: vi.fn(() => ({ nodeData: rootNode })),
            removeNodes,
            selectNode: vi.fn(),
        },
        topicElement,
    };
};

const Harness = ({
    mind,
    node = childNode,
    onFailure = vi.fn(),
}: {
    mind: ReturnType<typeof createMind>['mind'];
    node?: NodeObj;
    onFailure?: (error: unknown) => void;
}) => {
    const { deleteDialog, requestDelete } = useMindMapNodeDeletion({
        mind,
        onFailure,
    });
    return (
        <>
            <button type="button" onClick={() => requestDelete(node)}>Request delete</button>
            {deleteDialog}
        </>
    );
};

describe('useMindMapNodeDeletion', () => {
    it('counts empty, nested, and cyclic descendant inputs within a fixed bound', () => {
        expect(countMindMapDescendants({ id: 'empty', topic: '' })).toBe(0);
        expect(countMindMapDescendants(rootNode)).toBe(2);

        const cyclic = { id: 'cycle', topic: 'Cycle', children: [] } as NodeObj;
        cyclic.children = [cyclic];
        expect(countMindMapDescendants(cyclic)).toBe(10_000);
    });

    it('pins the requested target, names descendant impact, and deletes only after confirmation', async () => {
        const { mind, topicElement } = createMind();
        render(<Harness mind={mind} />);

        fireEvent.click(screen.getByRole('button', { name: 'Request delete' }));
        expect(screen.getByRole('dialog', { name: 'Delete “Carrier plan”?' })).toBeTruthy();
        expect(screen.getByText('This also removes 1 descendant nodes. You can undo this action.')).toBeTruthy();
        expect(mind.removeNodes).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
        await waitFor(() => expect(mind.removeNodes).toHaveBeenCalledWith([topicElement]));
        expect(mind.selectNode).toHaveBeenCalledWith(topicElement);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(bridge.success).toHaveBeenCalledWith('Node deleted');
    });

    it('keeps failures recoverable without rendering provider details', async () => {
        const removeNodes = vi.fn()
            .mockImplementationOnce(() => {
                throw new Error('secret provider payload');
            })
            .mockImplementationOnce(() => undefined);
        const onFailure = vi.fn();
        const { mind } = createMind(removeNodes);
        render(<Harness mind={mind} onFailure={onFailure} />);

        fireEvent.click(screen.getByRole('button', { name: 'Request delete' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));

        expect((await screen.findByRole('alert')).textContent).toContain('could not be deleted');
        expect(screen.queryByText('secret provider payload')).toBeNull();
        expect(onFailure).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('dialog')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
        await waitFor(() => expect(removeNodes).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('protects the root and allows cancellation without mutation', () => {
        const { mind } = createMind();
        const { rerender } = render(<Harness mind={mind} node={rootNode} />);
        fireEvent.click(screen.getByRole('button', { name: 'Request delete' }));
        expect(screen.queryByRole('dialog')).toBeNull();

        rerender(<Harness mind={mind} />);
        fireEvent.click(screen.getByRole('button', { name: 'Request delete' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(mind.removeNodes).not.toHaveBeenCalled();
    });
});
