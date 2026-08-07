// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MindMapBoundaryEditor } from '../MindMapBoundaryEditor';

describe('MindMapBoundaryEditor', () => {
    it('edits a named boundary with explicit title and color state', async () => {
        const onSave = vi.fn();
        render(
            <MindMapBoundaryEditor
                boundary={{ title: '现有分组', color: '#0ea5e9' }}
                onCancel={vi.fn()}
                onRemove={vi.fn()}
                onSave={onSave}
            />,
        );

        expect(screen.getByRole('dialog', { name: '编辑外框分组' })).toBeTruthy();
        expect(screen.getByRole('radio', { name: '外框颜色：天蓝' }).getAttribute('aria-checked')).toBe('true');
        fireEvent.change(screen.getByLabelText('外框标题'), { target: { value: '业务边界' } });
        fireEvent.click(screen.getByRole('radio', { name: '外框颜色：琥珀' }));
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: '业务边界', color: '#f59e0b' }));
    });

    it('supports removal and Escape cancellation without canvas propagation', async () => {
        const onCancel = vi.fn();
        const onRemove = vi.fn();
        render(
            <MindMapBoundaryEditor
                boundary={{ title: '现有分组', color: '#818cf8' }}
                onCancel={onCancel}
                onRemove={onRemove}
                onSave={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '移除外框' }));
        await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});

