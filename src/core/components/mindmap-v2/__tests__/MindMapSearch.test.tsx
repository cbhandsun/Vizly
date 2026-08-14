// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mindHarness = vi.hoisted(() => ({
    elements: new Map<string, HTMLElement>(),
    findEle: vi.fn((id: string) => mindHarness.elements.get(id) ?? null),
    getData: vi.fn(),
    reshapeNode: vi.fn(),
    scrollIntoView: vi.fn(),
    selectNode: vi.fn(),
}));
const modalConfirmMock = vi.hoisted(() => vi.fn());

vi.mock('../mindElixirStore', () => ({
    getMindElixirInstance: () => ({
        findEle: mindHarness.findEle,
        getData: mindHarness.getData,
        reshapeNode: mindHarness.reshapeNode,
        scrollIntoView: mindHarness.scrollIntoView,
        selectNode: mindHarness.selectNode,
    }),
}));

interface InputMockProps extends React.InputHTMLAttributes<HTMLInputElement> {
    variant?: string;
}

vi.mock('antd', () => {
    const Input = React.forwardRef<HTMLInputElement, InputMockProps>(({ variant: _variant, ...props }, ref) => (
        <input ref={ref} {...props} />
    ));
    Input.displayName = 'InputMock';

    return { Input };
});

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appModal: { confirm: modalConfirmMock },
}));

import MindMapSearch from '../MindMapSearch';
import { MINDMAP_MAX_TOPIC_LENGTH } from '../mindmapTreeSanitizer';

const root = {
    id: 'root',
    topic: '分支总览',
    children: [
        { id: 'node-1', topic: '入库分支', children: [] },
        { id: 'node-2', topic: '出库分支', children: [] },
        { id: 'node-3', topic: '运输节点', children: [] },
    ],
};

beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
        disconnect() {}
        observe() {}
        unobserve() {}
    });
});

beforeEach(() => {
    document.querySelectorAll('me-tpc').forEach(element => element.remove());
    mindHarness.elements.clear();
    for (const id of ['root', 'node-1', 'node-2', 'node-3']) {
        const element = document.createElement('me-tpc');
        element.dataset.nodeid = id;
        document.body.appendChild(element);
        mindHarness.elements.set(id, element);
    }
    mindHarness.findEle.mockClear();
    mindHarness.getData.mockReset();
    mindHarness.getData.mockReturnValue({ nodeData: root });
    mindHarness.reshapeNode.mockReset();
    mindHarness.scrollIntoView.mockClear();
    mindHarness.selectNode.mockClear();
    modalConfirmMock.mockReset();
});

interface ConfirmOptions {
    title?: React.ReactNode;
    content?: React.ReactNode;
    onOk?: () => void;
    afterClose?: () => void;
}

describe('MindMapSearch commercial interaction contract', () => {
    it('opens replace mode from Ctrl/Cmd+H, announces results, and confirms replace all', async () => {
        render(<MindMapSearch open onClose={vi.fn()} />);

        const searchInput = screen.getByRole('textbox', { name: '搜索节点' });
        expect(searchInput.getAttribute('maxlength')).toBe(String(MINDMAP_MAX_TOPIC_LENGTH));
        await waitFor(() => expect(document.activeElement).toBe(searchInput));

        fireEvent.change(searchInput, { target: { value: '分支' } });
        expect(screen.getByRole('status').textContent).toBe('第 1 项，共 3 项');

        fireEvent.keyDown(searchInput, { key: 'h', ctrlKey: true });
        const replacementInput = await screen.findByRole('textbox', { name: '替换文本' });
        await waitFor(() => expect(document.activeElement).toBe(replacementInput));
        expect(replacementInput.getAttribute('maxlength')).toBe(String(MINDMAP_MAX_TOPIC_LENGTH));

        fireEvent.change(replacementInput, { target: { value: '节点' } });
        fireEvent.click(screen.getByRole('button', { name: '替换所有匹配项，共 3 个节点' }));

        expect(mindHarness.reshapeNode).not.toHaveBeenCalled();
        const cancelledConfirmation = modalConfirmMock.mock.calls[0]?.[0] as ConfirmOptions;
        expect(cancelledConfirmation.title).toBe('替换 3 个匹配节点？');
        expect(cancelledConfirmation.content).toBe('查找“分支” → 替换为“节点”');

        act(() => cancelledConfirmation.afterClose?.());
        expect(mindHarness.reshapeNode).not.toHaveBeenCalled();
        await waitFor(() => expect(document.activeElement).toBe(replacementInput));

        fireEvent.click(screen.getByRole('button', { name: '替换所有匹配项，共 3 个节点' }));
        const confirmedReplacement = modalConfirmMock.mock.calls[1]?.[0] as ConfirmOptions;
        act(() => confirmedReplacement.onOk?.());
        act(() => confirmedReplacement.afterClose?.());

        expect(mindHarness.reshapeNode).toHaveBeenCalledTimes(3);
        expect(mindHarness.reshapeNode.mock.calls.map(call => call[1].topic)).toEqual([
            '节点总览',
            '入库节点',
            '出库节点',
        ]);
        expect(screen.getByRole('status').textContent).toBe('批量替换完成：成功 3 处');
    });

    it('reports partial failures and ignores IME confirmation keystrokes', async () => {
        mindHarness.reshapeNode.mockImplementationOnce(() => {
            throw new Error('simulated replacement failure');
        });
        render(<MindMapSearch open replaceRequested onClose={vi.fn()} />);

        const searchInput = screen.getByRole('textbox', { name: '搜索节点' });
        fireEvent.change(searchInput, { target: { value: '分支' } });
        const replacementInput = await screen.findByRole('textbox', { name: '替换文本' });
        await waitFor(() => expect(document.activeElement).toBe(replacementInput));
        fireEvent.change(replacementInput, { target: { value: '节点' } });
        fireEvent.keyDown(replacementInput, { key: 'Enter', keyCode: 229, isComposing: true });
        expect(mindHarness.reshapeNode).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '替换所有匹配项，共 3 个节点' }));
        const confirmation = modalConfirmMock.mock.calls[0]?.[0] as ConfirmOptions;
        act(() => confirmation.onOk?.());

        expect(mindHarness.reshapeNode).toHaveBeenCalledTimes(3);
        expect(screen.getByRole('status').textContent)
            .toBe('批量替换完成：成功 2 处，失败 1 处');
    });

    it('returns focus to the persistent trigger after close', async () => {
        const SearchHarness = () => {
            const [open, setOpen] = React.useState(false);
            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>搜索节点</button>
                    <MindMapSearch open={open} onClose={() => setOpen(false)} />
                </>
            );
        };
        render(<SearchHarness />);

        const trigger = screen.getByRole('button', { name: '搜索节点' });
        trigger.focus();
        fireEvent.click(trigger);
        await waitFor(() => expect(document.activeElement)
            .toBe(screen.getByRole('textbox', { name: '搜索节点' })));

        fireEvent.click(screen.getByRole('button', { name: '关闭搜索' }));

        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(screen.queryByRole('search', { name: '搜索并替换思维导图节点' })).toBeNull();
    });
});
