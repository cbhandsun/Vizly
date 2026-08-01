// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
        }),
    });
});

const reactFlowMocks = vi.hoisted(() => ({
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    getNodes: vi.fn(() => []),
    getEdges: vi.fn(() => []),
}));

const historyMocks = vi.hoisted(() => ({
    previewVersion: null as null | { id: string; message: string },
    saveVersion: vi.fn(async () => true),
    enterPreview: vi.fn(async () => true),
    exitPreview: vi.fn(() => null),
    restoreVersion: vi.fn(async () => true),
}));

vi.mock('@xyflow/react', () => ({
    useReactFlow: () => reactFlowMocks,
}));

vi.mock('../../hooks/useVersionHistory', () => ({
    useVersionHistory: () => ({
        versions: [],
        loading: false,
        previewVersion: historyMocks.previewVersion,
        saveVersion: historyMocks.saveVersion,
        enterPreview: historyMocks.enterPreview,
        exitPreview: historyMocks.exitPreview,
        restoreVersion: historyMocks.restoreVersion,
    }),
}));

import { VersionHistoryPanel } from '../VersionHistoryPanel';

describe('VersionHistoryPanel commercial preview safeguards', () => {
    beforeEach(() => {
        historyMocks.previewVersion = null;
        historyMocks.saveVersion.mockClear();
        historyMocks.enterPreview.mockClear();
        historyMocks.exitPreview.mockClear();
        historyMocks.restoreVersion.mockClear();
    });

    it('uses a concise localized title and keeps snapshot creation available normally', () => {
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={vi.fn()} />);

        expect(screen.getByText('版本历史')).toBeTruthy();
        expect(screen.queryByText('版本历史 (Version History)')).toBeNull();
        expect((screen.getByLabelText('版本备注（选填）') as HTMLInputElement).disabled).toBe(false);
        expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('prevents saving a new snapshot while an older version is being previewed', () => {
        historyMocks.previewVersion = { id: 'version-1', message: '发布候选版本' };
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={vi.fn()} />);

        const input = screen.getByLabelText('版本备注（选填）') as HTMLInputElement;
        const saveButton = screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement;

        expect(input.disabled).toBe(true);
        expect(saveButton.disabled).toBe(true);
        expect(screen.getByRole('status').textContent).toContain('退出预览后才能创建新快照');

        fireEvent.click(saveButton);
        expect(historyMocks.saveVersion).not.toHaveBeenCalled();
    });
});
