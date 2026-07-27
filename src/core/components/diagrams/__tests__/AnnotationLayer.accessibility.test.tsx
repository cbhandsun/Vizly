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

        fireEvent.click(screen.getByRole('button', { name: '查看批注：检查运输节点' }));
        expect(screen.getByRole('textbox', { name: '批注内容' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '关闭批注编辑器' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '标记批注为已解决' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '删除批注' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '选择批注颜色 #facc15' }).getAttribute('aria-pressed')).toBe('true');
    });
});
