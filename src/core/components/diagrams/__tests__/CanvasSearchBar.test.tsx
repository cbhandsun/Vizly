// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import React from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import type { Edge, Node } from '@xyflow/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { getInternalNodeMock, setCenterMock } = vi.hoisted(() => ({
    getInternalNodeMock: vi.fn(),
    setCenterMock: vi.fn(),
}));

vi.mock('@xyflow/react', async () => {
    const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
    return {
        ...actual,
        useReactFlow: () => ({
            getInternalNode: getInternalNodeMock,
            setCenter: setCenterMock,
        }),
    };
});

import { CanvasSearchBar } from '../CanvasSearchBar';
import {
    buildPresentationEdgeIdSelector,
    buildPresentationNodeSelector,
} from '../../presentation/presentationSelectorSafety';
import {
    planFlowchartCanvasTextReplacement,
    type FlowchartCanvasSearchMatch,
} from '../flowchartSearchReplace';
import en from '../../../../locales/en.json';
import i18n from '../../../../i18n';

beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
        observe() { /* jsdom layout is not observed in these interaction tests. */ }
        unobserve() { /* jsdom layout is not observed in these interaction tests. */ }
        disconnect() { /* jsdom layout is not observed in these interaction tests. */ }
    });
});

afterAll(() => {
    vi.unstubAllGlobals();
});

describe('CanvasSearchBar', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh');
        getInternalNodeMock.mockReset();
        setCenterMock.mockReset();
    });

    it('exposes named search, replace, navigation, and close controls', async () => {
        render(
            <CanvasSearchBar
                visible
                onClose={vi.fn()}
                nodes={[{
                    id: 'node-1',
                    position: { x: 10, y: 20 },
                    data: { label: 'Circle' },
                }]}
                onReplaceMatch={vi.fn()}
                onReplaceAll={vi.fn()}
            />,
        );

        expect(screen.getByRole('search', { name: '画布内容查找与替换' }).classList)
            .toContain('canvas-search-bar');
        expect(screen.getByRole('textbox', { name: '搜索画布内容' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '关闭画布搜索' })).toBeTruthy();

        fireEvent.change(screen.getByRole('textbox', { name: '搜索画布内容' }), {
            target: { value: 'Circle' },
        });
        expect(screen.getByRole('status', {
            name: '第 1 项，共 1 项：节点文本，Circle',
        }).textContent).toBe('1/1');
        expect(Array.from(document.querySelectorAll('style')).some(style =>
            style.textContent?.includes('@media (prefers-reduced-motion: reduce)'),
        )).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: '打开查找替换' }));

        expect(screen.getByRole('textbox', { name: '替换为' })).toBeTruthy();
        expect(document.querySelector('.canvas-search-primary-row')).toBeTruthy();
        expect(document.querySelector('.canvas-search-controls')).toBeTruthy();
        expect(document.querySelector('.canvas-search-replace-row')).toBeTruthy();
        expect(document.querySelector('.canvas-search-replace-actions')).toBeTruthy();
        fireEvent.change(screen.getByRole('textbox', { name: '替换为' }), {
            target: { value: 'Shape' },
        });
        expect(screen.getByRole('button', { name: '替换当前匹配' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '全部替换，共 1 个节点文本' })).toBeTruthy();
        await waitFor(() => expect(document.activeElement)
            .toBe(screen.getByRole('textbox', { name: '替换为' })));
    });

    it('localizes the complete find and replace surface in English', async () => {
        const englishI18n = createInstance();
        await englishI18n.init({
            lng: 'en',
            fallbackLng: 'en',
            resources: { en: { translation: en } },
        });

        render(
            <I18nextProvider i18n={englishI18n}>
                <CanvasSearchBar
                    visible
                    onClose={vi.fn()}
                    nodes={[{
                        id: 'node-1',
                        position: { x: 10, y: 20 },
                        data: { label: 'Circle' },
                    }]}
                    onReplaceMatch={vi.fn()}
                    onReplaceAll={vi.fn()}
                />
            </I18nextProvider>,
        );

        expect(screen.getByRole('search', { name: 'Find and replace canvas content' })).toBeTruthy();
        const search = screen.getByRole('textbox', { name: 'Search canvas content' });
        fireEvent.change(search, { target: { value: 'Circle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Open find and replace' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), {
            target: { value: 'Shape' },
        });

        expect(screen.getByRole('button', { name: 'Replace current match' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Replace all, 1 node text' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Close canvas search' })).toBeTruthy();
        expect(screen.getByRole('status', {
            name: 'Result 1 of 1: node text, Circle',
        })).toBeTruthy();
    });

    it('keeps mobile search below the toolbar, clear of the icon rail, and resilient at narrow widths', () => {
        const css = readFileSync(
            'src/core/components/diagrams/FlowchartDesigner.css',
            'utf8',
        );

        expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.canvas-search-bar[\s\S]*?top: 96px/);
        expect(css).toMatch(/\.canvas-search-bar[\s\S]*?left: calc\(8px \+ var\(--commercial-touch-target, 44px\) \+ 8px\)/);
        expect(css).toMatch(/\.canvas-search-primary-row,[\s\S]*?\.canvas-search-replace-row[\s\S]*?display: grid !important/);
        expect(css).toMatch(/\.canvas-search-controls,[\s\S]*?\.canvas-search-replace-actions[\s\S]*?grid-column: 1 \/ -1[\s\S]*?flex-wrap: wrap/);
        expect(css).toMatch(/\.canvas-search-bar[\s\S]*?overflow-y: auto !important/);
        expect(css).toMatch(/\.canvas-search-icon-button[\s\S]*?min-width: var\(--commercial-touch-target, 44px\) !important[\s\S]*?height: var\(--commercial-touch-target, 44px\) !important/);
    });

    it('centers nested search matches with their rendered absolute position', async () => {
        getInternalNodeMock.mockReturnValue({
            measured: { width: 200, height: 100 },
            internals: { positionAbsolute: { x: 500, y: 700 } },
        });
        render(
            <CanvasSearchBar
                visible
                onClose={vi.fn()}
                nodes={[{
                    id: 'nested-node',
                    parentId: 'group-node',
                    position: { x: 20, y: 30 },
                    data: { label: 'Nested result' },
                }]}
            />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: '搜索画布内容' }), {
            target: { value: 'Nested' },
        });

        await waitFor(() => expect(setCenterMock).toHaveBeenLastCalledWith(
            600,
            750,
            { zoom: 1.2, duration: 300 },
        ));
    });

    it('clears the active query and keeps keyboard focus in search', async () => {
        render(
            <CanvasSearchBar
                visible
                onClose={vi.fn()}
                nodes={[{
                    id: 'node-1',
                    position: { x: 10, y: 20 },
                    data: { label: 'Circle' },
                }]}
            />,
        );
        const input = screen.getByRole('textbox', { name: '搜索画布内容' }) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Circle' } });

        fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

        expect(input.value).toBe('');
        await waitFor(() => expect(document.activeElement).toBe(input));
        expect(screen.queryByRole('button', { name: '清空搜索' })).toBeNull();
    });

    it('restores focus to the persistent toolbar trigger after closing', async () => {
        const SearchHarness = () => {
            const [visible, setVisible] = React.useState(true);
            return (
                <>
                    <button type="button" data-flowchart-search-focus-return="true">更多操作</button>
                    <CanvasSearchBar
                        visible={visible}
                        onClose={() => setVisible(false)}
                        nodes={[]}
                    />
                </>
            );
        };
        render(<SearchHarness />);
        const returnTarget = screen.getByRole('button', { name: '更多操作' });

        fireEvent.click(screen.getByRole('button', { name: '关闭画布搜索' }));

        await waitFor(() => expect(document.activeElement).toBe(returnTarget));
        expect(screen.queryByRole('search', { name: '画布内容查找与替换' })).toBeNull();
    });

    it('closes the complete search surface when Escape is pressed in the replacement input', () => {
        const onClose = vi.fn();
        render(
            <CanvasSearchBar
                visible
                replaceVisible
                onClose={onClose}
                nodes={[{
                    id: 'node-1',
                    position: { x: 10, y: 20 },
                    data: { label: 'Circle' },
                }]}
                onReplaceMatch={vi.fn()}
                onReplaceAll={vi.fn()}
            />,
        );

        fireEvent.keyDown(screen.getByRole('textbox', { name: '替换为' }), { key: 'Escape' });

        expect(onClose).toHaveBeenCalledOnce();
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
                onReplaceMatch={vi.fn()}
                onReplaceAll={vi.fn()}
            />,
        );

        expect(screen.getByRole('textbox', { name: '替换为' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('画布暂无可搜索内容');
        fireEvent.click(screen.getByRole('button', { name: '关闭替换' }));
        expect(onReplaceVisibleChange).toHaveBeenCalledWith(false);

        const featureLayerSource = readFileSync(
            'src/core/components/diagrams/ui/DesignerCanvasFeaturesLayer.tsx',
            'utf8',
        );
        expect(featureLayerSource).toContain('replaceVisible={search.replaceVisible}');
        expect(featureLayerSource).toContain('onReplaceVisibleChange={search.onReplaceVisibleChange}');
    });

    it('requires confirmation before replacing all eligible node text and restores input focus', async () => {
        const nodes = [{
            id: 'node-1',
            position: { x: 10, y: 20 },
            data: { label: 'Circle circle' },
        }];
        const onReplaceAll = vi.fn((matches: FlowchartCanvasSearchMatch[], query: string, replacement: string) => (
            planFlowchartCanvasTextReplacement(nodes, [], matches, query, replacement)
        ));
        render(
            <CanvasSearchBar
                visible
                replaceVisible
                onClose={vi.fn()}
                nodes={nodes}
                onReplaceMatch={(match, query, replacement) => (
                    planFlowchartCanvasTextReplacement(nodes, [], [match], query, replacement)
                )}
                onReplaceAll={onReplaceAll}
            />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: '搜索画布内容' }), {
            target: { value: 'circle' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: '替换为' }), {
            target: { value: 'Square' },
        });
        fireEvent.click(screen.getByRole('button', { name: '全部替换，共 1 个节点文本' }));

        expect(onReplaceAll).not.toHaveBeenCalled();
        expect(screen.getByText('替换 1 个节点文本？')).toBeTruthy();
        expect(screen.getByText('查找“circle” → 替换为“Square”')).toBeTruthy();
        expect(readFileSync('src/core/components/diagrams/CanvasSearchBar.tsx', 'utf8'))
            .toMatch(/placement="bottomRight"\s+autoAdjustOverflow=\{false\}\s+zIndex=\{2600\}\s+getPopupContainer=\{\(\) => document\.body\}/);
        fireEvent.click(screen.getByRole('button', { name: '确认替换' }));
        expect(onReplaceAll).toHaveBeenCalledWith([{ kind: 'node', id: 'node-1' }], 'circle', 'Square');
        await waitFor(() => expect(document.activeElement)
            .toBe(screen.getByRole('textbox', { name: '替换为' })));
    });

    it('finds, centers, highlights, and replaces a visible edge label', async () => {
        const nodes: Node[] = [
            { id: 'source', position: { x: 0, y: 0 }, data: { label: 'Source' } },
            { id: 'target', position: { x: 300, y: 0 }, data: { label: 'Target' } },
        ];
        const edges: Edge[] = [{
            id: 'edge-fee',
            source: 'source',
            target: 'target',
            label: '运输费用',
        }];
        const onReplaceMatch = vi.fn((match: FlowchartCanvasSearchMatch, query: string, replacement: string) => (
            planFlowchartCanvasTextReplacement(nodes, edges, [match], query, replacement)
        ));
        render(
            <CanvasSearchBar
                visible
                replaceVisible
                onClose={vi.fn()}
                nodes={nodes}
                edges={edges}
                onReplaceMatch={onReplaceMatch}
                onReplaceAll={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: '搜索画布内容' }), {
            target: { value: '运输费用' },
        });

        expect(screen.getByRole('status', {
            name: '第 1 项，共 1 项：连线标签，运输费用',
        }).textContent).toBe('1/1');
        await waitFor(() => expect(setCenterMock).toHaveBeenLastCalledWith(
            210,
            30,
            { zoom: 1.2, duration: 300 },
        ));
        const styleText = Array.from(document.querySelectorAll('style'))
            .map(style => style.textContent ?? '')
            .join('\n');
        expect(styleText).toContain(buildPresentationEdgeIdSelector('edge-fee'));

        fireEvent.change(screen.getByRole('textbox', { name: '替换为' }), {
            target: { value: '配送费用' },
        });
        fireEvent.click(screen.getByRole('button', { name: '替换当前匹配' }));

        expect(onReplaceMatch).toHaveBeenCalledWith(
            { kind: 'edge', id: 'edge-fee' },
            '运输费用',
            '配送费用',
        );
        expect(screen.getByRole('status', { name: '替换操作状态' }).textContent)
            .toBe('已替换 1 个连线标签');
    });

    it('disables replacement and explains why a matching node is protected', () => {
        render(
            <CanvasSearchBar
                visible
                replaceVisible
                onClose={vi.fn()}
                nodes={[{
                    id: 'node-1',
                    position: { x: 10, y: 20 },
                    data: { label: 'Circle', locked: true },
                }]}
                onReplaceMatch={vi.fn()}
                onReplaceAll={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: '搜索画布内容' }), {
            target: { value: 'Circle' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: '替换为' }), {
            target: { value: 'Square' },
        });

        expect(screen.getByRole('button', { name: '替换当前匹配' })).toHaveProperty('disabled', true);
        expect(screen.getByRole('button', { name: '全部替换，共 0 项内容' })).toHaveProperty('disabled', true);
        expect(screen.getByRole('status', { name: '替换操作状态' }).textContent)
            .toBe('当前结果已锁定，不会被替换');
    });

    it('restores replacement focus and resynchronizes results after an external undo', async () => {
        const originalNodes: Node[] = [
            {
                id: 'node-1',
                position: { x: 10, y: 20 },
                data: {
                    label: '物流订单中心',
                    description: '<b>物流订单中心</b><br/>• 拆分物流单',
                },
            },
            {
                id: 'node-2',
                position: { x: 30, y: 40 },
                data: { label: '物流追踪平台' },
            },
        ];
        const SearchUndoHarness = () => {
            const [nodes, setNodes] = React.useState(originalNodes);
            const replace = (matches: FlowchartCanvasSearchMatch[], query: string, replacement: string) => {
                const result = planFlowchartCanvasTextReplacement(nodes, [], matches, query, replacement);
                setNodes(result.nodes);
                return result;
            };
            return (
                <>
                    <button type="button" onClick={() => setNodes(originalNodes)}>撤销替换</button>
                    <CanvasSearchBar
                        visible
                        replaceVisible
                        onClose={vi.fn()}
                        nodes={nodes}
                        onReplaceMatch={(match, query, replacement) => replace([match], query, replacement)}
                        onReplaceAll={replace}
                    />
                </>
            );
        };
        render(<SearchUndoHarness />);
        const searchInput = screen.getByRole('textbox', { name: '搜索画布内容' });
        const replacementInput = screen.getByRole('textbox', { name: '替换为' });
        fireEvent.change(searchInput, { target: { value: '物流' } });
        fireEvent.change(replacementInput, { target: { value: '运输' } });

        fireEvent.click(screen.getByRole('button', { name: '替换当前匹配' }));

        await waitFor(() => expect(document.activeElement).toBe(replacementInput));
        expect(screen.getByRole('status', { name: '替换操作状态' }).textContent)
            .toBe('已替换 1 个节点文本');

        fireEvent.click(screen.getByRole('button', { name: '撤销替换' }));

        await waitFor(() => expect(screen.queryByRole('status', { name: '替换操作状态' })).toBeNull());
        expect(document.activeElement).toBe(replacementInput);
        expect(screen.getAllByRole('status').some(status => status.textContent === '1/2')).toBe(true);
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

        fireEvent.change(screen.getByRole('textbox', { name: '搜索画布内容' }), {
            target: { value: 'Unsafe imported node' },
        });

        const styleText = Array.from(document.querySelectorAll('style'))
            .map(style => style.textContent ?? '')
            .join('\n');
        expect(styleText).toContain(buildPresentationNodeSelector(unsafeId));
        expect(styleText).not.toContain(`data-id="${unsafeId}"`);
    });
});
