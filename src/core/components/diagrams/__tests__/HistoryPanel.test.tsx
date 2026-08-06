// @vitest-environment jsdom

import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        i18n: { language: 'zh-CN', resolvedLanguage: 'zh-CN' },
        t: (key: string, params?: { count?: number; label?: string; time?: string }) => ({
            'designer.historyPanel.title': '历史记录',
            'designer.historyPanel.undo': '撤销',
            'designer.historyPanel.redo': '重做',
            'designer.historyPanel.close': '关闭历史记录',
            'designer.historyPanel.empty': '暂无历史记录',
            'designer.historyPanel.current': '当前状态',
            'designer.historyPanel.unknownOperation': '未命名操作',
            'designer.historyPanel.justNow': '刚才',
            'designer.historyPanel.unknownTime': '时间未知',
            'designer.historyPanel.undoStatus': '已撤销上一步，可使用重做恢复',
            'designer.historyPanel.redoStatus': '已重做上一步',
            'designer.historyPanel.restoreEntry': `恢复到 ${params?.label}，${params?.time}`,
            'designer.historyPanel.restoredStatus': `已恢复到“${params?.label}”，可使用重做返回恢复前状态`,
            'designer.historyPanel.changeCount': `${params?.count ?? 0} 项变动`,
            'designer.historyPanel.secondsAgo': `${params?.count ?? 0} 秒前`,
            'designer.historyPanel.minutesAgo': `${params?.count ?? 0} 分钟前`,
        }[key] ?? key),
    }),
}));

import { HistoryPanel } from '../HistoryPanel';

describe('HistoryPanel', () => {
    const installAnimationFrameQueue = () => {
        const callbacks: FrameRequestCallback[] = [];
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callbacks.push(callback);
            return 1;
        });
        return () => {
            while (callbacks.length > 0) callbacks.shift()?.(0);
        };
    };

    afterEach(() => vi.unstubAllGlobals());

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

        const panel = screen.getByRole('dialog', { name: '历史记录' });
        expect(panel.style.width).toBe('calc(100vw - 32px)');
        expect(panel.style.maxWidth).toBe('320px');
        expect(panel.style.right).toBe('16px');
        expect(screen.getByRole('button', { name: '撤销' }).style.width).toBe('var(--commercial-touch-target, 44px)');
        expect(screen.getByRole('button', { name: '关闭历史记录' }).style.height).toBe('var(--commercial-touch-target, 44px)');
        expect(document.activeElement).toBe(panel);
    });

    it('closes on Escape and returns focus to the document action trigger', () => {
        const flushAnimationFrames = installAnimationFrameQueue();
        const Harness = () => {
            const [visible, setVisible] = useState(true);
            return (
                <>
                    <button type="button" data-history-focus-return>文档操作</button>
                    <HistoryPanel
                        visible={visible}
                        onClose={() => setVisible(false)}
                        pastEntries={[]}
                        canUndo={false}
                        canRedo={false}
                        onUndo={vi.fn()}
                        onRedo={vi.fn()}
                        onJumpTo={vi.fn()}
                    />
                </>
            );
        };
        render(<Harness />);

        fireEvent.keyDown(document, { key: 'Escape' });
        act(flushAnimationFrames);
        expect(screen.queryByRole('dialog', { name: '历史记录' })).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: '文档操作' }));
    });

    it('announces a reversible recovery after jumping to a named history entry', () => {
        const flushAnimationFrames = installAnimationFrameQueue();
        const onJumpTo = vi.fn();
        render(
            <HistoryPanel
                visible
                onClose={vi.fn()}
                pastEntries={[{
                    patch: [],
                    changeCount: 4,
                    timestamp: Date.now(),
                    label: '复制 1 个节点前',
                }]}
                canUndo
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onJumpTo={onJumpTo}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '恢复到 复制 1 个节点前，刚才' }));
        act(flushAnimationFrames);

        expect(onJumpTo).toHaveBeenCalledWith(0);
        expect(screen.getByRole('status').textContent).toContain('可使用重做返回恢复前状态');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: '恢复到 复制 1 个节点前，刚才' }));
    });

    it('keeps focus inside the panel when a recovery removes the selected entry', () => {
        const flushAnimationFrames = installAnimationFrameQueue();
        const Harness = () => {
            const [entries, setEntries] = useState([{
                patch: [],
                changeCount: 1,
                timestamp: Date.now(),
                label: '操作 #1',
            }]);
            return (
                <HistoryPanel
                    visible
                    onClose={vi.fn()}
                    pastEntries={entries}
                    canUndo={entries.length > 0}
                    canRedo={false}
                    onUndo={vi.fn()}
                    onRedo={vi.fn()}
                    onJumpTo={() => setEntries([])}
                />
            );
        };
        render(<Harness />);

        fireEvent.click(screen.getByRole('button', { name: '恢复到 操作 #1，刚才' }));
        act(flushAnimationFrames);

        expect(document.activeElement).toBe(screen.getByRole('dialog', { name: '历史记录' }));
    });
});
