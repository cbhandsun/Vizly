// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MermaidImportModal } from '../MermaidImportModal';

const parserMocks = vi.hoisted(() => ({
    parse: vi.fn(() => {
        throw new Error('Mermaid 语法无效');
    }),
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
        fireEvent.click(screen.getByRole('button', { name: /解析并生成/ }));

        await screen.findByText('Mermaid 语法无效');
        expect(document.getElementById('mermaid-import-error')?.textContent).toContain('Mermaid 语法无效');
        expect(editor.getAttribute('aria-invalid')).toBe('true');
        expect(editor.getAttribute('aria-describedby')).toBe('mermaid-import-error');
        expect(onImport).not.toHaveBeenCalled();
    });
});
