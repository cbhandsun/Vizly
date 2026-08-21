import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { showMindMapImportFeedback } from '../mindMapImportFeedback';

const bridge = vi.hoisted(() => ({
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
}));

vi.mock('../../../utils/antdStaticBridge', () => ({
    appMessage: bridge,
}));

const translate = vi.fn((key: string, options?: { format?: string }) => (
    options?.format ? `${key}:${options.format}` : key
)) as unknown as TFunction;

beforeEach(() => {
    vi.clearAllMocks();
});

describe('showMindMapImportFeedback', () => {
    it('replaces progress with the final result under one stable message key', () => {
        showMindMapImportFeedback({ format: 'JSON', kind: 'started' }, translate);
        showMindMapImportFeedback({ format: 'JSON', kind: 'success' }, translate);
        showMindMapImportFeedback({ format: 'OPML', kind: 'error', reason: 'invalid' }, translate);

        expect(bridge.loading).toHaveBeenCalledWith({
            content: 'mindmapImport.progress:JSON',
            duration: 0,
            key: 'mindmap-import-progress',
        });
        expect(bridge.success).toHaveBeenCalledWith({
            content: 'mindmapImport.success:JSON',
            key: 'mindmap-import-progress',
        });
        expect(bridge.error).toHaveBeenCalledWith({
            content: 'mindmapImport.invalid:OPML',
            key: 'mindmap-import-progress',
        });
    });

    it('distinguishes duplicate work and every recoverable failure reason', () => {
        showMindMapImportFeedback({
            activeFormat: 'JSON',
            format: 'Markdown',
            kind: 'busy',
        }, translate);

        for (const reason of ['aborted', 'read', 'scope-changed', 'too-large'] as const) {
            showMindMapImportFeedback({ format: 'Markdown', kind: 'error', reason }, translate);
        }

        expect(bridge.warning).toHaveBeenCalledWith('mindmapImport.inProgress:JSON');
        expect(bridge.error.mock.calls.map(([message]) => message.content)).toEqual([
            'mindmapImport.aborted:Markdown',
            'mindmapImport.readFailed:Markdown',
            'mindmapImport.scopeChanged:Markdown',
            'mindmapImport.tooLarge:Markdown',
        ]);
    });
});
