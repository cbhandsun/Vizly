// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { JsonEditorModal } from '../JsonEditorModal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'designer.jsonEditor.title': '编辑图表数据',
            'designer.jsonEditor.format': '格式化 JSON',
            'designer.jsonEditor.download': '下载文件',
            'designer.jsonEditor.applyOnly': '应用但不关闭',
            'designer.jsonEditor.saveAndClose': '应用修改并关闭',
            'designer.jsonEditor.formatStandard': '标准数据',
            'designer.jsonEditor.formatPure': '纯净数据',
            'designer.jsonEditor.formatReactFlow': 'React Flow',
            'common.cancel': '取消',
        }[key] ?? key),
    }),
}));

vi.mock('../../lazy/LazyMonacoEditor', () => ({
    default: () => <div role="status">编辑器加载中</div>,
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

describe('JsonEditorModal loading controls', () => {
    it('keeps data actions disabled until an editor is interactive', () => {
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

        for (const name of ['格式化 JSON', '下载文件', '应用但不关闭', '应用修改并关闭']) {
            const button = screen.getByRole('button', { name: new RegExp(name.split('').join('\\s*')) });
            expect((button as HTMLButtonElement).disabled).toBe(true);
        }
        expect((screen.getByRole('button', { name: /取\s*消/ }) as HTMLButtonElement).disabled).toBe(false);
    });
});
