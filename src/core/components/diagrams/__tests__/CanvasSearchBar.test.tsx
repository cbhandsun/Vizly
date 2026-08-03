// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { setCenterMock } = vi.hoisted(() => ({
    setCenterMock: vi.fn(),
}));

vi.mock('@xyflow/react', async () => {
    const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
    return {
        ...actual,
        useReactFlow: () => ({ setCenter: setCenterMock }),
    };
});

import { CanvasSearchBar } from '../CanvasSearchBar';
import { buildPresentationNodeSelector } from '../../presentation/presentationSelectorSafety';

describe('CanvasSearchBar', () => {
    it('exposes named search, replace, navigation, and close controls', () => {
        render(
            <CanvasSearchBar
                visible
                onClose={vi.fn()}
                nodes={[{
                    id: 'node-1',
                    position: { x: 10, y: 20 },
                    data: { label: 'Circle' },
                }]}
                onReplaceNode={vi.fn()}
                onReplaceAll={vi.fn()}
            />,
        );

        expect(screen.getByRole('search', { name: '画布节点查找与替换' }).classList)
            .toContain('canvas-search-bar');
        expect(screen.getByRole('textbox', { name: '搜索画布节点' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '关闭画布搜索' })).toBeTruthy();

        fireEvent.change(screen.getByRole('textbox', { name: '搜索画布节点' }), {
            target: { value: 'Circle' },
        });
        expect(screen.getByRole('status').textContent).toBe('1/1');
        expect(Array.from(document.querySelectorAll('style')).some(style =>
            style.textContent?.includes('@media (prefers-reduced-motion: reduce)'),
        )).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: '打开查找替换' }));

        expect(screen.getByRole('textbox', { name: '替换为' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '替换当前匹配' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '全部替换，共 1 处' })).toBeTruthy();
    });

    it('keeps the mobile search below the second toolbar row with touch-sized actions', () => {
        const css = readFileSync(
            'src/core/components/diagrams/FlowchartDesigner.css',
            'utf8',
        );

        expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.canvas-search-bar[\s\S]*?top: 96px/);
        expect(css).toMatch(/\.canvas-search-icon-button[\s\S]*?min-width: var\(--commercial-touch-target, 44px\) !important[\s\S]*?height: var\(--commercial-touch-target, 44px\) !important/);
    });

    it('opens replace mode from controlled shortcut state without a delayed DOM click', () => {
        const onReplaceVisibleChange = vi.fn();
        render(
            <CanvasSearchBar
                visible
                replaceVisible
                onReplaceVisibleChange={onReplaceVisibleChange}
                onClose={vi.fn()}
                nodes={[]}
                onReplaceNode={vi.fn()}
                onReplaceAll={vi.fn()}
            />,
        );

        expect(screen.getByRole('textbox', { name: '替换为' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('画布暂无节点');
        fireEvent.click(screen.getByRole('button', { name: '关闭替换' }));
        expect(onReplaceVisibleChange).toHaveBeenCalledWith(false);
    });

    it('escapes imported node ids before composing highlight selectors', () => {
        const unsafeId = 'node-1"] { color: red; } /*';
        render(
            <CanvasSearchBar
                visible
                onClose={vi.fn()}
                nodes={[{
                    id: unsafeId,
                    position: { x: 0, y: 0 },
                    data: { label: 'Unsafe imported node' },
                }]}
            />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: '搜索画布节点' }), {
            target: { value: 'Unsafe imported node' },
        });

        const styleText = Array.from(document.querySelectorAll('style'))
            .map(style => style.textContent ?? '')
            .join('\n');
        expect(styleText).toContain(buildPresentationNodeSelector(unsafeId));
        expect(styleText).not.toContain(`data-id="${unsafeId}"`);
    });
});
