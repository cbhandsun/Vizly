// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const translationState = vi.hoisted(() => ({ language: 'zh' as 'zh' | 'en' }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: string | Record<string, unknown>) => {
            const translations: Record<'zh' | 'en', Record<string, string>> = {
                zh: {
                    'comment.view': '查看批注：{{content}}',
                    'comment.emptyContent': '空评论',
                    'comment.newDialog': '新建批注',
                    'comment.editDialog': '编辑批注',
                    'comment.closeEditor': '关闭批注编辑器',
                    'comment.contentLabel': '批注内容',
                    'comment.newContentLabel': '新批注内容',
                    'comment.contentPlaceholder': '输入批注内容...',
                    'comment.colorGroup': '批注颜色',
                    'comment.colorOption': '批注颜色：{{color}}',
                    'comment.colors.yellow': '黄色',
                    'comment.colors.blue': '蓝色',
                    'comment.colors.green': '绿色',
                    'comment.colors.custom': '自定义颜色 {{color}}',
                    'comment.markResolved': '标记批注为已解决',
                    'comment.markUnresolved': '标记批注为未解决',
                    'comment.delete': '删除批注',
                    'comment.deleteConfirmTitle': '删除此批注？',
                    'comment.deleteConfirmDescription': '删除后无法恢复。',
                    'comment.keyboardHint': 'Ctrl+Enter 保存 · Esc 关闭',
                    'comment.validation.required': '请输入批注内容',
                    'comment.validation.tooLong': '批注内容不能超过 {{maxLength}} 个字符',
                    'comment.validation.saveFailed': '批注保存失败，请重试',
                    'common.save': '保存',
                    'common.cancel': '取消',
                    'common.add': '添加',
                    'common.delete': '删除',
                },
                en: {
                    'comment.view': 'View comment: {{content}}',
                    'comment.emptyContent': 'Empty comment',
                    'comment.newDialog': 'Add comment',
                    'comment.editDialog': 'Edit comment',
                    'comment.closeEditor': 'Close comment editor',
                    'comment.contentLabel': 'Comment content',
                    'comment.newContentLabel': 'New comment content',
                    'comment.contentPlaceholder': 'Enter comment content...',
                    'comment.colorGroup': 'Comment color',
                    'comment.colorOption': 'Comment color: {{color}}',
                    'comment.colors.yellow': 'Yellow',
                    'comment.colors.blue': 'Blue',
                    'comment.colors.green': 'Green',
                    'comment.colors.custom': 'Custom color {{color}}',
                    'comment.markResolved': 'Mark as resolved',
                    'comment.markUnresolved': 'Mark as unresolved',
                    'comment.delete': 'Delete',
                    'comment.deleteConfirmTitle': 'Delete this comment?',
                    'comment.deleteConfirmDescription': 'This action cannot be undone.',
                    'comment.keyboardHint': 'Ctrl+Enter to save · Esc to close',
                    'comment.validation.required': 'Enter comment content',
                    'comment.validation.tooLong': 'Comment content cannot exceed {{maxLength}} characters',
                    'comment.validation.saveFailed': 'The comment could not be saved. Try again.',
                    'common.save': 'Save',
                    'common.cancel': 'Cancel',
                    'common.add': 'Add',
                    'common.delete': 'Delete',
                },
            };
            const template = translations[translationState.language][key]
                ?? (typeof options === 'string' ? options : key);
            if (!options || typeof options === 'string') return template;
            return template.replace(/{{(\w+)}}/g, (_match, name: string) => String(options[name] ?? ''));
        },
    }),
}));

import { AnnotationLayer } from '../AnnotationLayer';

vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

describe('AnnotationLayer accessibility', () => {
    beforeEach(() => {
        translationState.language = 'zh';
    });
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
        expect(screen.getByRole('dialog', { name: '编辑批注' })).toBeTruthy();
        expect(screen.getByRole('textbox', { name: '批注内容' })).toBeTruthy();
        expect(screen.getByTestId('active-annotation-editor').style.position).toBe('fixed');
        expect(screen.getByRole('button', { name: '关闭批注编辑器' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '标记批注为已解决' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '删除批注' })).toBeTruthy();
        expect(screen.getByRole('radio', { name: '批注颜色：黄色' }).getAttribute('aria-checked')).toBe('true');
    });

    it('uses a single-tab-stop color group with arrow-key selection', async () => {
        const onUpdate = vi.fn();
        render(
            <AnnotationLayer
                annotations={[{
                    id: 'comment-color',
                    content: '检查颜色语义',
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
                colors={['#facc15', '#60a5fa', '#34d399']}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '查看批注：检查颜色语义' }));
        const radios = screen.getAllByRole('radio');
        const yellow = screen.getByRole('radio', { name: '批注颜色：黄色' });
        expect(screen.getByRole('radiogroup', { name: '批注颜色' })).toBeTruthy();
        expect(radios.filter(radio => radio.getAttribute('tabindex') === '0')).toHaveLength(1);

        yellow.focus();
        fireEvent.keyDown(yellow, { key: 'ArrowRight' });

        const blue = screen.getByRole('radio', { name: '批注颜色：蓝色' });
        expect(onUpdate).toHaveBeenCalledWith('comment-color', { color: '#60a5fa' });
        await waitFor(() => expect(document.activeElement).toBe(blue));
    });

    it('returns focus to the comment pin after close and a successful save', async () => {
        const onUpdate = vi.fn(() => true);
        render(
            <AnnotationLayer
                annotations={[{
                    id: 'comment-focus',
                    content: '检查焦点',
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

        let pin = screen.getByRole('button', { name: '查看批注：检查焦点' });
        fireEvent.click(pin);
        fireEvent.click(screen.getByRole('button', { name: '关闭批注编辑器' }));
        pin = screen.getByRole('button', { name: '查看批注：检查焦点' });
        await waitFor(() => expect(document.activeElement).toBe(pin));

        fireEvent.click(pin);
        fireEvent.change(screen.getByRole('textbox', { name: '批注内容' }), {
            target: { value: '更新后的检查焦点' },
        });
        fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));
        pin = screen.getByRole('button', { name: '查看批注：检查焦点' });
        await waitFor(() => expect(document.activeElement).toBe(pin));
    });

    it('keeps the initial editor stable and closes it only after an actual page switch', async () => {
        const annotation = {
            id: 'comment-page',
            content: '检查页面切换',
            x: 80,
            y: 80,
            color: '#facc15',
            authorId: 'user-1',
            authorName: '测试用户',
            authorColor: '#3b82f6',
            createdAt: 1,
            isResolved: false,
            replies: [],
        };
        const commonProps = {
            annotations: [annotation],
            annotationMode: false,
            onAdd: vi.fn(),
            onUpdate: vi.fn(),
            onDelete: vi.fn(),
            onToggleResolved: vi.fn(),
            colors: ['#facc15'],
        };
        const { rerender } = render(
            <AnnotationLayer {...commonProps} activePageId="page-1" />,
        );

        fireEvent.click(screen.getByRole('button', { name: '查看批注：检查页面切换' }));
        expect(screen.getByRole('dialog', { name: '编辑批注' })).toBeTruthy();
        await new Promise(resolve => window.setTimeout(resolve, 0));
        expect(screen.getByRole('dialog', { name: '编辑批注' })).toBeTruthy();

        rerender(<AnnotationLayer {...commonProps} activePageId="page-2" />);
        await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑批注' })).toBeNull());
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
        expect(screen.getByRole('dialog', { name: '新建批注' })).toBeTruthy();
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

    it('renders the complete editor flow in the active language', () => {
        translationState.language = 'en';
        render(
            <AnnotationLayer
                annotations={[{
                    id: 'comment-english',
                    content: 'Check shipment status',
                    x: 80,
                    y: 80,
                    color: '#facc15',
                    authorId: 'user-1',
                    authorName: 'Alex',
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

        fireEvent.click(screen.getByRole('button', { name: 'View comment: Check shipment status' }));
        expect(screen.getByRole('dialog', { name: 'Edit comment' })).toBeTruthy();
        expect(screen.getByRole('textbox', { name: 'Comment content' }).getAttribute('placeholder')).toBe('Enter comment content...');
        expect(screen.getByRole('radiogroup', { name: 'Comment color' })).toBeTruthy();
        expect(screen.getByRole('radio', { name: 'Comment color: Yellow' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Close comment editor' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Mark as resolved' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    });

    it('suppresses rapid duplicate add and save submissions', () => {
        const onAdd = vi.fn(() => true);
        const onUpdate = vi.fn(() => true);
        const { container, rerender } = render(
            <AnnotationLayer
                annotations={[]}
                annotationMode
                onAdd={onAdd}
                onUpdate={onUpdate}
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
        fireEvent.change(screen.getByRole('textbox', { name: '新批注内容' }), {
            target: { value: '避免重复创建' },
        });
        const addButton = screen.getByRole('button', { name: /添\s*加/ });
        act(() => {
            addButton.click();
            addButton.click();
        });
        expect(onAdd).toHaveBeenCalledTimes(1);

        rerender(
            <AnnotationLayer
                annotations={[{
                    id: 'comment-lock',
                    content: '避免重复保存',
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
                onAdd={onAdd}
                onUpdate={onUpdate}
                onDelete={vi.fn()}
                onToggleResolved={vi.fn()}
                colors={['#facc15']}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: '查看批注：避免重复保存' }));
        const saveButton = screen.getByRole('button', { name: /保\s*存/ });
        act(() => {
            saveButton.click();
            saveButton.click();
        });
        expect(onUpdate).toHaveBeenCalledTimes(1);
    });
});
