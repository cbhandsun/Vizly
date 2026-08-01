// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { JsonEditorModal } from '../JsonEditorModal';

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
                'designer.jsonEditor.applyOnly': '仅预览并应用',
                'designer.jsonEditor.saveAndClose': '应用修改并关闭',
                'designer.jsonEditor.formatStandard': '标准数据',
                'designer.jsonEditor.formatPure': '纯净数据',
                'designer.jsonEditor.formatReactFlow': 'React Flow',
                'designer.jsonEditor.basicEditorLabel': 'JSON 基础编辑器',
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
}));

vi.mock('../designerUtils', () => ({
    canvasToPureStandardData: () => ({ nodes: [], edges: [] }),
    canvasToStandardData: () => ({ nodes: [], edges: [], groups: [] }),
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
        expect(alert.textContent).toContain('JSON 无效');
        expect((editor as HTMLTextAreaElement).value).toBe('{');
        expect(editor.getAttribute('aria-invalid')).toBe('true');
        expect(editor.getAttribute('aria-describedby')).toBe('json-editor-validation-error');

        fireEvent.change(editor, { target: { value: '{}' } });
        expect(screen.queryByRole('alert')).toBeNull();
        expect(editor.getAttribute('aria-invalid')).toBeNull();
    });
});
