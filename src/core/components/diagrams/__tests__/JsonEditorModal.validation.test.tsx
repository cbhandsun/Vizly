// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { JsonEditorModal } from '../JsonEditorModal';

const runtimeMocks = vi.hoisted(() => ({
    registerDiagram: vi.fn(),
}));

const modalMocks = vi.hoisted(() => ({
    confirm: vi.fn(),
}));

const conversionMocks = vi.hoisted(() => ({
    nodes: [{ id: 'applied-node', position: { x: 0, y: 0 }, data: {} }],
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown> | string) => {
            if (key === 'designer.flowchart.invalidJson') {
                return `JSON 无效：${String(typeof options === 'object' ? options?.reason ?? '' : '')}`;
            }
            const translations: Record<string, string> = {
                'designer.jsonEditor.title': '编辑图表数据',
                'designer.jsonEditor.format': '格式化 JSON',
                'designer.jsonEditor.download': '下载文件',
                'designer.jsonEditor.applyOnly': '应用但不关闭',
                'designer.jsonEditor.saveAndClose': '应用修改并关闭',
                'designer.jsonEditor.discardTitle': '放弃未应用的修改？',
                'designer.jsonEditor.discardContent': '关闭后，本次 JSON 草稿中的未应用修改将丢失。',
                'designer.jsonEditor.discardConfirm': '放弃修改',
                'designer.jsonEditor.keepEditing': '继续编辑',
                'designer.jsonEditor.formatStandard': '标准数据',
                'designer.jsonEditor.formatPure': '纯净数据',
                'designer.jsonEditor.formatReactFlow': 'React Flow',
                'designer.jsonEditor.basicEditorLabel': 'JSON 基础编辑器',
                'designer.flowchart.invalidJsonSyntax': '语法错误，请检查括号、引号和逗号',
                'designer.flowchart.invalidJsonTooLarge': '内容超过允许的大小限制',
                'designer.flowchart.invalidJsonUnknownReason': '无法解析 JSON',
                'designer.flowchart.jsonApplied': '应用成功',
                'common.cancel': '取消',
            };
            return translations[key] ?? key;
        },
    }),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
    },
    appModal: {
        confirm: modalMocks.confirm,
    },
}));

vi.mock('../designerUtils', () => ({
    canvasToPureStandardData: () => ({ nodes: [], edges: [] }),
    canvasToStandardData: () => ({ nodes: [], edges: [], groups: [] }),
    standardDataToCanvas: async () => ({
        nodes: conversionMocks.nodes,
        edges: [],
    }),
}));

vi.mock('@/core/ports/applicationDiagramRuntime', () => ({
    getApplicationDiagramRuntime: () => ({
        registerDiagram: runtimeMocks.registerDiagram,
    }),
}));

class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());

describe('JsonEditorModal validation feedback', () => {
    it('keeps invalid JSON visible and explains the failure inside the dialog', async () => {
        render(
            <JsonEditorModal
                visible
                onClose={vi.fn()}
                nodes={[]}
                edges={[]}
                setNodes={vi.fn()}
                setEdges={vi.fn()}
                reactFlowInstance={{ fitView: vi.fn() }}
                initialContent="{}"
            />,
        );

        const editor = await screen.findByRole('textbox', { name: 'JSON 基础编辑器' });
        fireEvent.change(editor, { target: { value: '{' } });
        fireEvent.click(screen.getByRole('button', { name: /应用修改并关闭/ }));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('JSON 无效：语法错误，请检查括号、引号和逗号');
        expect(alert.textContent).not.toContain('Diagram JSON is invalid.');
        expect((editor as HTMLTextAreaElement).value).toBe('{');
        expect(editor.getAttribute('aria-invalid')).toBe('true');
        expect(editor.getAttribute('aria-describedby')).toBe('json-editor-validation-error');

        fireEvent.change(editor, { target: { value: '{}' } });
        expect(screen.queryByRole('alert')).toBeNull();
        expect(editor.getAttribute('aria-invalid')).toBeNull();
    });

    it('applies standard JSON without persisting, reloading, or closing the dialog', async () => {
        conversionMocks.nodes = [{ id: 'applied-node', position: { x: 0, y: 0 }, data: {} }];
        runtimeMocks.registerDiagram.mockClear();
        const onClose = vi.fn();
        const setNodes = vi.fn();
        const setEdges = vi.fn();

        render(
            <JsonEditorModal
                visible
                onClose={onClose}
                nodes={[]}
                edges={[]}
                setNodes={setNodes}
                setEdges={setEdges}
                reactFlowInstance={{ fitView: vi.fn() }}
                initialContent={'{"type":"flowchart","version":"1.0.0","nodes":[],"edges":[]}'}
                diagramId="diagram-1"
            />,
        );

        await screen.findByRole('textbox', { name: 'JSON 基础编辑器' });
        fireEvent.click(screen.getByRole('button', { name: /应用但不关闭/ }));

        await waitFor(() => expect(setNodes).toHaveBeenCalledTimes(1));
        expect(setEdges).toHaveBeenCalledTimes(1);
        expect(runtimeMocks.registerDiagram).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).not.toBeNull();
    });

    it('applies a valid empty diagram and snapshots before replacing the canvas', async () => {
        conversionMocks.nodes = [];
        const onBeforeCanvasReplace = vi.fn();
        const setNodes = vi.fn();
        const setEdges = vi.fn();

        render(
            <JsonEditorModal
                visible
                onClose={vi.fn()}
                nodes={[{ id: 'existing-node', position: { x: 0, y: 0 }, data: {} }]}
                edges={[]}
                setNodes={setNodes}
                setEdges={setEdges}
                reactFlowInstance={{ fitView: vi.fn() }}
                initialContent={'{"type":"flowchart","version":"1.0.0","nodes":[],"edges":[]}' }
                onBeforeCanvasReplace={onBeforeCanvasReplace}
            />,
        );

        await screen.findByRole('textbox', { name: 'JSON 基础编辑器' });
        fireEvent.click(screen.getByRole('button', { name: /应用但不关闭/ }));

        await waitFor(() => expect(setNodes).toHaveBeenCalledWith([]));
        expect(setEdges).toHaveBeenCalledWith([]);
        expect(onBeforeCanvasReplace).toHaveBeenCalledTimes(1);
        expect(onBeforeCanvasReplace.mock.invocationCallOrder[0]).toBeLessThan(setNodes.mock.invocationCallOrder[0]);
    });

    it('asks before discarding an edited JSON draft', async () => {
        modalMocks.confirm.mockClear();
        const onClose = vi.fn();
        render(
            <JsonEditorModal
                visible
                onClose={onClose}
                nodes={[]}
                edges={[]}
                setNodes={vi.fn()}
                setEdges={vi.fn()}
                reactFlowInstance={{ fitView: vi.fn() }}
                initialContent="{}"
            />,
        );

        const editor = await screen.findByRole('textbox', { name: 'JSON 基础编辑器' });
        fireEvent.change(editor, { target: { value: '{"nodes":[]}' } });
        fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }));

        expect(onClose).not.toHaveBeenCalled();
        expect(modalMocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
            zIndex: 2200,
            title: '放弃未应用的修改？',
            okButtonProps: { danger: true },
        }));

        const confirmConfig = modalMocks.confirm.mock.calls[0]?.[0] as { onOk?: () => void };
        confirmConfig.onOk?.();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
