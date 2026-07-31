// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@xyflow/react', async () => {
    const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
    return {
        ...actual,
        BaseEdge: () => <svg data-testid="base-edge" />,
        EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        getBezierPath: () => ['M0 0 L100 100', 50, 50, 0, 0],
        getSmoothStepPath: () => ['M0 0 L100 100', 50, 50, 0, 0],
        getStraightPath: () => ['M0 0 L100 100', 50, 50, 0, 0],
    };
});

import CustomEdge from '../../custom-nodes/CustomEdge';

const createProps = (
    data: Record<string, unknown>,
): React.ComponentProps<typeof CustomEdge> => ({
    id: 'edge-1',
    source: 'source',
    target: 'target',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: 'right',
    targetPosition: 'left',
    selected: true,
    data,
} as unknown as React.ComponentProps<typeof CustomEdge>);

describe('CustomEdge label editing', () => {
    it('lets a selected unlabeled edge add and commit a label', () => {
        const onLabelChange = vi.fn();
        render(<CustomEdge {...createProps({ onLabelChange })} />);

        fireEvent.click(screen.getByRole('button', { name: '添加连线标签' }));
        const editor = screen.getByRole('textbox', { name: '编辑连线标签' });
        fireEvent.change(editor, { target: { value: '审批通过' } });
        fireEvent.keyDown(editor, { key: 'Enter' });

        expect(onLabelChange).toHaveBeenCalledWith('edge-1', '审批通过');
    });

    it('cancels an edit on Escape without persisting the draft', () => {
        const onLabelChange = vi.fn();
        render(<CustomEdge {...createProps({ label: '原标签', onLabelChange })} />);

        fireEvent.click(screen.getByRole('button', { name: '编辑连线标签：原标签' }));
        const editor = screen.getByRole('textbox', { name: '编辑连线标签' });
        fireEvent.change(editor, { target: { value: '未保存' } });
        fireEvent.keyDown(editor, { key: 'Escape' });

        expect(onLabelChange).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '编辑连线标签：原标签' })).toBeTruthy();
    });
});
