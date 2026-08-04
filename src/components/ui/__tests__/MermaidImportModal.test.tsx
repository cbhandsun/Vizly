// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MermaidImportModal } from '../MermaidImportModal';

const parserMocks = vi.hoisted(() => ({
    parse: vi.fn(),
}));

vi.mock('@/services/import/MermaidParser', () => ({
    MermaidParser: {
        getInstance: () => ({ parse: parserMocks.parse }),
    },
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
    vi.clearAllMocks();
    parserMocks.parse.mockImplementation(() => {
        throw new Error('Mermaid 语法无效');
    });
});

describe('MermaidImportModal', () => {
    it('provides an immediate local editor and inline parse feedback', async () => {
        const onImport = vi.fn();
        render(
            <MermaidImportModal
                visible
                onClose={vi.fn()}
                onImport={onImport}
            />,
        );

        const editor = screen.getByRole('textbox', { name: 'Mermaid 基础编辑器' });
        expect((editor as HTMLTextAreaElement).value).toContain('graph TD');
        expect(document.querySelector('.mermaid-import-modal')).toBeTruthy();

        fireEvent.change(editor, { target: { value: 'invalid' } });
        fireEvent.click(screen.getByRole('button', { name: '解析 Mermaid 并生成' }));

        await screen.findByText('解析失败，请检查 Mermaid 语法。');
        expect(document.getElementById('mermaid-import-error')?.textContent).toContain('解析失败');
        expect(editor.getAttribute('aria-invalid')).toBe('true');
        expect(editor.getAttribute('aria-describedby')).toBe('mermaid-import-error');
        expect(onImport).not.toHaveBeenCalled();
    });

    it('renders above the mobile shell in the shared viewport modal layer', () => {
        render(<MermaidImportModal visible onClose={vi.fn()} onImport={vi.fn()} />);

        const modalRoot = document.querySelector('.commercial-viewport-modal.mermaid-import-modal');
        const modalWrap = modalRoot?.querySelector<HTMLElement>('.ant-modal-wrap');

        expect(modalRoot).toBeTruthy();
        expect(modalWrap?.style.zIndex).toBe('2200');
    });

    it('disables empty submissions without discarding the editor contents', () => {
        render(<MermaidImportModal visible onClose={vi.fn()} onImport={vi.fn()} />);

        const editor = screen.getByRole('textbox', { name: 'Mermaid 基础编辑器' });
        fireEvent.change(editor, { target: { value: '   ' } });

        expect(screen.getByRole('button', { name: '解析 Mermaid 并生成' }).hasAttribute('disabled')).toBe(true);
        expect((editor as HTMLTextAreaElement).value).toBe('   ');
    });

    it('waits for the real import result and blocks duplicate submissions', async () => {
        parserMocks.parse.mockReturnValue({
            nodes: [{ id: 'node-1', position: { x: 0, y: 0 }, data: { label: 'Node' } }],
            edges: [],
        });
        let resolveImport: ((value: boolean) => void) | undefined;
        const onImport = vi.fn(() => new Promise<boolean>((resolve) => {
            resolveImport = resolve;
        }));
        const onClose = vi.fn();
        render(<MermaidImportModal visible onClose={onClose} onImport={onImport} />);

        const submit = screen.getByRole('button', { name: '解析 Mermaid 并生成' });
        fireEvent.click(submit);
        fireEvent.click(submit);

        expect(onImport).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: '取消 Mermaid 导入' }).hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('button', { name: '关闭 Mermaid 导入' }).hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('textbox', { name: 'Mermaid 基础编辑器' }).hasAttribute('readonly')).toBe(true);
        expect(onClose).not.toHaveBeenCalled();

        resolveImport?.(true);
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('keeps a safe inline recovery state when applying the parsed graph fails', async () => {
        parserMocks.parse.mockReturnValue({
            nodes: [{ id: 'node-1', position: { x: 0, y: 0 }, data: { label: 'Node' } }],
            edges: [],
        });
        const onClose = vi.fn();
        const onImport = vi.fn(async () => false);
        render(<MermaidImportModal visible onClose={onClose} onImport={onImport} />);

        fireEvent.click(screen.getByRole('button', { name: '解析 Mermaid 并生成' }));

        await screen.findByText('导入未完成，当前画布未被替换。请检查画布状态后重试。');
        const recovery = document.getElementById('mermaid-import-error');
        expect(recovery?.textContent).toContain('导入未完成');
        expect(recovery?.textContent).toContain('当前画布未被替换');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('does not expose parser exception contents in the UI', async () => {
        parserMocks.parse.mockImplementation(() => {
            throw new Error('Authorization: Bearer mermaid-import-secret');
        });
        render(<MermaidImportModal visible onClose={vi.fn()} onImport={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: '解析 Mermaid 并生成' }));

        await screen.findByText('解析失败，请检查 Mermaid 语法。');
        expect(document.body.textContent).not.toContain('mermaid-import-secret');
    });
});
