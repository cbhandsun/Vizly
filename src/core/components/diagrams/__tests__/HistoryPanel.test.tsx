// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HistoryPanel } from '../HistoryPanel';

describe('HistoryPanel', () => {
    it('stays inside narrow viewports and exposes named physical touch targets', () => {
        render(
            <HistoryPanel
                visible
                onClose={vi.fn()}
                pastEntries={[]}
                canUndo
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onJumpTo={vi.fn()}
            />,
        );

        const panel = screen.getByRole('region', { name: '历史记录' });
        expect(panel.style.width).toBe('calc(100vw - 32px)');
        expect(panel.style.maxWidth).toBe('320px');
        expect(panel.style.right).toBe('16px');
        expect(screen.getByRole('button', { name: '撤销' }).style.width).toBe('var(--commercial-touch-target, 44px)');
        expect(screen.getByRole('button', { name: '关闭历史记录' }).style.height).toBe('var(--commercial-touch-target, 44px)');
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(
            <HistoryPanel
                visible
                onClose={onClose}
                pastEntries={[]}
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onJumpTo={vi.fn()}
            />,
        );

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
    });
});
