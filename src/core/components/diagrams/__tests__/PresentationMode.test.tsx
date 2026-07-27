// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PresentationMode from '../../presentation/PresentationMode';

describe('PresentationMode', () => {
    const slides = [
        { id: 'one', title: '概览', notes: '第一页', nodeIds: ['a'], containerIds: [] },
        { id: 'two', title: '详情', notes: '第二页', nodeIds: ['b'], containerIds: [] },
    ];

    it('exposes named controls and never renders internal debug identifiers', () => {
        render(<PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={vi.fn()} />);

        expect(screen.getByRole('dialog', { name: '演示模式' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '上一页' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '下一页' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '退出演示' })).toBeTruthy();
        expect(screen.queryByText(/\[Debug\]/)).toBeNull();
    });

    it('supports page controls and Escape exit', () => {
        const onExit = vi.fn();
        render(<PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={onExit} />);

        fireEvent.click(screen.getByRole('button', { name: '下一页' }));
        expect(screen.getByText('详情')).toBeTruthy();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onExit).toHaveBeenCalledTimes(1);
    });
});
