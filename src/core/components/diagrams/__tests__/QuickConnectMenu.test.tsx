// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { getNodeMock } = vi.hoisted(() => ({
    getNodeMock: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
    useReactFlow: () => ({ getNode: getNodeMock }),
}));

vi.mock('antd', () => ({
    theme: {
        useToken: () => ({
            token: {
                borderRadius: 6,
                borderRadiusLG: 8,
                colorPrimary: '#1677ff',
                colorPrimaryBg: '#e6f4ff',
                colorText: '#1f1f1f',
                colorTextSecondary: '#595959',
                colorTextTertiary: '#8c8c8c',
            },
        }),
    },
}));

vi.mock('../ShapePreview', () => ({
    ShapePreview: ({ shape }: { shape: string }) => <span data-shape={shape} />,
}));

import { QuickConnectMenu } from '../QuickConnectMenu';
import i18n from '../../../../i18n';

beforeAll(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
    });
});

afterAll(() => {
    vi.unstubAllGlobals();
});

describe('QuickConnectMenu', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh');
        getNodeMock.mockReset();
    });

    it('localizes the picker and exposes its keyboard selection through combobox semantics', () => {
        const onSelect = vi.fn();
        render(
            <QuickConnectMenu
                x={400}
                y={200}
                visible
                onSelect={onSelect}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByRole('dialog', { name: '快速连接形状选择器' })).toBeTruthy();
        const search = screen.getByRole('combobox', { name: '搜索要连接的形状' });
        const listbox = screen.getByRole('listbox', { name: '可连接的形状' });
        const process = screen.getByRole('option', { name: '流程' });
        const startEnd = screen.getByRole('option', { name: '开始/结束' });

        expect(search.getAttribute('aria-controls')).toBe(listbox.id);
        expect(search.getAttribute('aria-activedescendant')).toBe(process.id);
        expect(process.getAttribute('aria-selected')).toBe('true');

        fireEvent.keyDown(search, { key: 'ArrowRight' });

        expect(search.getAttribute('aria-activedescendant')).toBe(startEnd.id);
        expect(process.getAttribute('aria-selected')).toBe('false');
        expect(startEnd.getAttribute('aria-selected')).toBe('true');

        fireEvent.keyDown(search, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
            label: '开始/结束',
            type: 'flowchart',
        }));
    });

    it('keeps English aliases searchable in Chinese and announces an empty result', () => {
        render(
            <QuickConnectMenu
                x={400}
                y={200}
                visible
                onSelect={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        const search = screen.getByRole('combobox', { name: '搜索要连接的形状' });

        fireEvent.change(search, { target: { value: 'database' } });
        expect(screen.getAllByRole('option')).toHaveLength(1);
        expect(screen.getByRole('option', { name: '数据库' })).toBeTruthy();

        fireEvent.change(search, { target: { value: 'not-a-shape' } });
        expect(screen.queryAllByRole('option')).toHaveLength(0);
        expect(screen.getByRole('status').textContent).toBe('未找到匹配的形状');
        expect(search.getAttribute('aria-activedescendant')).toBeNull();
    });

    it('closes once on Escape and restores focus to the source node', async () => {
        const onClose = vi.fn();
        getNodeMock.mockReturnValue({ data: { shape: 'rectangle' } });
        const Harness = () => {
            const [visible, setVisible] = React.useState(true);
            return (
                <div className="react-flow" role="application">
                    <div className="react-flow__node" data-id="source-1" tabIndex={0} />
                    <QuickConnectMenu
                        x={400}
                        y={200}
                        visible={visible}
                        sourceNodeId="source-1"
                        onSelect={vi.fn()}
                        onClose={() => {
                            onClose();
                            setVisible(false);
                        }}
                    />
                </div>
            );
        };
        render(<Harness />);

        fireEvent.keyDown(screen.getByRole('combobox', { name: '搜索要连接的形状' }), {
            key: 'Escape',
        });

        await waitFor(() => expect(document.activeElement)
            .toBe(document.querySelector('[data-id="source-1"]')));
        expect(onClose).toHaveBeenCalledOnce();
        expect(screen.queryByRole('dialog', { name: '快速连接形状选择器' })).toBeNull();
    });

    it('restores the canvas context after Escape when no source node exists', async () => {
        const Harness = () => {
            const [visible, setVisible] = React.useState(true);
            return (
                <div className="react-flow" role="application">
                    <QuickConnectMenu
                        x={400}
                        y={200}
                        visible={visible}
                        onSelect={vi.fn()}
                        onClose={() => setVisible(false)}
                    />
                </div>
            );
        };
        render(<Harness />);
        const canvas = document.querySelector<HTMLElement>('.react-flow');
        if (!canvas) throw new Error('test fixture missing');

        fireEvent.keyDown(screen.getByRole('combobox', { name: '搜索要连接的形状' }), {
            key: 'Escape',
        });

        await waitFor(() => expect(document.activeElement).toBe(canvas));
        expect(canvas.getAttribute('tabindex')).toBe('-1');
    });
});
