// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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
        expect(screen.getByRole('button', { name: '关闭批注编辑器' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '标记批注为已解决' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '删除批注' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '选择批注颜色 #facc15' }).getAttribute('aria-pressed')).toBe('true');
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
});
