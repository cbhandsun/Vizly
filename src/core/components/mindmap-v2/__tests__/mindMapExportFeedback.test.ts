import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { showMindMapExportFeedback } from '../mindMapExportFeedback';

const bridge = vi.hoisted(() => ({
    error: vi.fn(),
    info: vi.fn(),
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

describe('showMindMapExportFeedback', () => {
    it('replaces progress with the final result under one stable message key', () => {
        showMindMapExportFeedback({ format: 'PNG', kind: 'started' }, translate);
        showMindMapExportFeedback({ format: 'PNG', kind: 'success' }, translate);
        showMindMapExportFeedback({ format: 'SVG', kind: 'error' }, translate);

        expect(bridge.loading).toHaveBeenCalledWith({
            content: 'export.progress:PNG',
            duration: 0,
            key: 'mindmap-export-progress',
        });
        expect(bridge.success).toHaveBeenCalledWith({
            content: 'export.success:PNG',
            key: 'mindmap-export-progress',
        });
        expect(bridge.error).toHaveBeenCalledWith({
            content: 'export.failed:SVG',
            key: 'mindmap-export-progress',
        });
    });

    it('distinguishes duplicate work from an opened print dialog', () => {
        showMindMapExportFeedback({
            activeFormat: 'XMind',
            format: 'PNG',
            kind: 'busy',
        }, translate);
        showMindMapExportFeedback({ format: 'PDF', kind: 'print-opened' }, translate);

        expect(bridge.warning).toHaveBeenCalledWith('export.inProgress:XMind');
        expect(bridge.info).toHaveBeenCalledWith('export.printOpened');
        expect(bridge.success).not.toHaveBeenCalled();
    });
});
