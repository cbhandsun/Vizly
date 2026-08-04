// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnnotationLayer } from '../AnnotationLayer';

vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

describe('AnnotationLayer accessibility', () => {
    it('provides keyboard-discoverable names for pin and editor actions', () => {
        render(
            <AnnotationLayer
                annotations={[{
                    id: 'comment-1',
                    content: '检查运输节点',
                    x: 80,
                    y: 80,
                    color: '#facc15',
                    authorId: 'user-1',
                    authorName: '测试用户',
                    authorColor: '#3b82f6',
                    createdAt: 1,
                    isResolved: false,
                    replies: [],
                }]}
                annotationMode={false}
                onAdd={vi.fn()}
                onUpdate={vi.fn()}
                onDelete={vi.fn()}
                onToggleResolved={vi.fn()}
                colors={['#facc15', '#3b82f6']}
            />,
        );

        const pin = screen.getByRole('button', { name: '查看批注：检查运输节点' });
        expect(pin.style.width).toBe('44px');
        fireEvent.click(pin);
        expect(screen.getByRole('textbox', { name: '批注内容' })).toBeTruthy();
        expect(screen.getByTestId('active-annotation-editor').style.position).toBe('fixed');
        expect(screen.getByRole('button', { name: '关闭批注编辑器' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '标记批注为已解决' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '删除批注' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '选择批注颜色 #facc15' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('keeps the existing-comment editor within the mobile viewport', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 728 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 984 });
        render(
            <AnnotationLayer
                annotations={[{
                    id: 'comment-edge',
                    content: '边缘批注',
                    x: 390,
                    y: 700,
                    color: '#facc15',
                    authorId: 'user-1',
                    authorName: '测试用户',
                    authorColor: '#3b82f6',
                    createdAt: 1,
                    isResolved: false,
                    replies: [],
                }]}
                annotationMode={false}
                onAdd={vi.fn()}
                onUpdate={vi.fn()}
                onDelete={vi.fn()}
                onToggleResolved={vi.fn()}
                colors={['#facc15']}
            />,
        );

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 406 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
        fireEvent.click(screen.getByRole('button', { name: '查看批注：边缘批注' }), {
            clientX: 390,
            clientY: 700,
        });
        const editor = screen.getByTestId('active-annotation-editor');
        await waitFor(() => {
            expect(editor.style.left).toBe('94px');
            expect(editor.style.top).toBe('412px');
        });
    });

    it('blocks blank edits with an associated error and keeps the editor open', () => {
        const onUpdate = vi.fn();
        render(
            <AnnotationLayer
                annotations={[{
                    id: 'comment-blank',
                    content: '原始内容',
                    x: 80,
                    y: 80,
                    color: '#facc15',
                    authorId: 'user-1',
                    authorName: '测试用户',
                    authorColor: '#3b82f6',
                    createdAt: 1,
                    isResolved: false,
                    replies: [],
                }]}
                annotationMode={false}
                onAdd={vi.fn()}
                onUpdate={onUpdate}
                onDelete={vi.fn()}
                onToggleResolved={vi.fn()}
                colors={['#facc15']}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '查看批注：原始内容' }));
        const input = screen.getByRole('textbox', { name: '批注内容' });
        fireEvent.change(input, { target: { value: '   ' } });

        expect(screen.getByRole('alert').textContent).toBe('请输入批注内容');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe('annotation-edit-content-error');
        expect(input.getAttribute('maxlength')).toBe('4000');
        expect(screen.getByRole('button', { name: /保\s*存/ }).hasAttribute('disabled')).toBe(true);
        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
        expect(onUpdate).not.toHaveBeenCalled();
        expect(screen.getByTestId('active-annotation-editor')).toBeTruthy();
    });

    it('normalizes valid edits and reports host rejection without closing', () => {
        const onUpdate = vi.fn(() => false);
        render(
            <AnnotationLayer
                annotations={[{
                    id: 'comment-failure',
                    content: '原始内容',
                    x: 80,
                    y: 80,
                    color: '#facc15',
                    authorId: 'user-1',
                    authorName: '测试用户',
                    authorColor: '#3b82f6',
                    createdAt: 1,
                    isResolved: false,
                    replies: [],
                }]}
                annotationMode={false}
                onAdd={vi.fn()}
                onUpdate={onUpdate}
                onDelete={vi.fn()}
                onToggleResolved={vi.fn()}
                colors={['#facc15']}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '查看批注：原始内容' }));
        fireEvent.change(screen.getByRole('textbox', { name: '批注内容' }), {
            target: { value: '  更新\u200B内容  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

        expect(onUpdate).toHaveBeenCalledWith('comment-failure', { content: '更新内容' });
        expect(screen.getByRole('alert').textContent).toBe('批注保存失败，请重试');
        expect(screen.getByTestId('active-annotation-editor')).toBeTruthy();
    });

    it('portals a new editor above the mobile bottom navigation while preserving canvas coordinates', () => {
        const onAdd = vi.fn();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 406 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
        const { container } = render(
            <AnnotationLayer
                annotations={[]}
                annotationMode
                onAdd={onAdd}
                onUpdate={vi.fn()}
                onDelete={vi.fn()}
                onToggleResolved={vi.fn()}
                colors={['#facc15']}
            />,
        );
        const layer = container.firstElementChild as HTMLElement;
        vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 406, bottom: 844, width: 406, height: 844,
            toJSON: () => ({}),
        });

        fireEvent.click(layer, { clientX: 100, clientY: 650 });
        const editor = screen.getByTestId('pending-annotation-editor');
        expect(editor.style.position).toBe('fixed');
        expect(editor.style.top).toBe('516px');
        fireEvent.change(screen.getByRole('textbox', { name: '新批注内容' }), { target: { value: '移动端批注' } });
        fireEvent.click(screen.getByRole('button', { name: /添\s*加/ }));
        expect(onAdd).toHaveBeenCalledWith(100, 650, '移动端批注');
    });

    it('keeps a blank keyboard submission open and associates the validation error', () => {
        const onAdd = vi.fn();
        const { container } = render(
            <AnnotationLayer
                annotations={[]}
                annotationMode
                onAdd={onAdd}
                onUpdate={vi.fn()}
                onDelete={vi.fn()}
                onToggleResolved={vi.fn()}
                colors={['#facc15']}
            />,
        );
        const layer = container.firstElementChild as HTMLElement;
        vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 406, bottom: 844, width: 406, height: 844,
            toJSON: () => ({}),
        });

        fireEvent.click(layer, { clientX: 100, clientY: 200 });
        const input = screen.getByRole('textbox', { name: '新批注内容' });
        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

        expect(onAdd).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toBe('请输入批注内容');
        expect(input.getAttribute('aria-describedby')).toBe('annotation-new-content-error');
        expect(screen.getByTestId('pending-annotation-editor')).toBeTruthy();
    });
});
