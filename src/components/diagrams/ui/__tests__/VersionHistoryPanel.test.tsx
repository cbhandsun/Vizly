// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        i18n: { language: 'en', resolvedLanguage: 'en' },
        t: (key: string, params?: Record<string, string>) => {
            const messages: Record<string, string> = {
                'designer.versionHistoryPanel.title': 'Version history',
                'designer.versionHistoryPanel.close': 'Close version history',
                'designer.versionHistoryPanel.createTitle': 'Create snapshot',
                'designer.versionHistoryPanel.messageLabel': 'Snapshot note (optional)',
                'designer.versionHistoryPanel.messagePlaceholder': 'Snapshot note (optional), for example: Added order module',
                'designer.versionHistoryPanel.save': 'Save snapshot',
                'designer.versionHistoryPanel.defaultMessage': 'Manually saved snapshot',
                'designer.versionHistoryPanel.messageHint': 'If left blank, the note will be “{{defaultMessage}}”.',
                'designer.versionHistoryPanel.previewing': 'Previewing: {{message}}',
                'designer.versionHistoryPanel.previewReadonly': 'Preview is read-only. Exit preview to edit or create a snapshot.',
                'designer.versionHistoryPanel.exitPreview': 'Exit preview',
                'designer.versionHistoryPanel.emptyTitle': 'No version snapshots yet',
                'designer.versionHistoryPanel.emptyDescription': 'Save a snapshot before major changes. Restoring later creates a safety backup first.',
                'designer.versionHistoryPanel.preview': 'Preview',
                'designer.versionHistoryPanel.previewVersion': 'Preview version: {{message}}',
                'designer.versionHistoryPanel.exitPreviewVersion': 'Exit preview: {{message}}',
                'designer.versionHistoryPanel.restoreTitle': 'Restore version',
                'designer.versionHistoryPanel.restoreDescription': 'The current canvas will be backed up first. If the backup fails, restore will be cancelled. Restore this version?',
                'designer.versionHistoryPanel.restore': 'Restore',
                'designer.versionHistoryPanel.cancel': 'Cancel',
                'designer.versionHistoryPanel.restoreTooltip': 'Restore this version',
                'designer.versionHistoryPanel.restoreVersion': 'Restore version: {{message}}',
                'designer.versionHistoryPanel.unnamed': 'Unnamed snapshot',
                'designer.versionHistoryPanel.latest': 'Latest',
                'designer.versionHistoryPanel.createdBy': 'Created by {{author}}',
                'designer.versionHistoryPanel.loadErrorTitle': 'Version history could not be loaded',
                'designer.versionHistoryPanel.loadErrorDescription': 'Your snapshots may still be available. Check the connection and try again.',
                'designer.versionHistoryPanel.retry': 'Try again',
            };
            return (messages[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => params?.[name] ?? '');
        },
    }),
}));

beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        value: class ResizeObserverMock {
            observe() { return undefined; }
            unobserve() { return undefined; }
            disconnect() { return undefined; }
        },
    });
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
    versions: [] as Array<{
        id: string;
        diagramId: string;
        snapshotData: null;
        createdAt: number;
        message: string;
    }>,
    previewVersion: null as null | { id: string; message: string },
    loadError: false,
    loadVersions: vi.fn(async () => undefined),
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
        versions: historyMocks.versions,
        loading: false,
        loadError: historyMocks.loadError,
        previewVersion: historyMocks.previewVersion,
        loadVersions: historyMocks.loadVersions,
        saveVersion: historyMocks.saveVersion,
        enterPreview: historyMocks.enterPreview,
        exitPreview: historyMocks.exitPreview,
        restoreVersion: historyMocks.restoreVersion,
    }),
}));

import { VersionHistoryPanel } from '../VersionHistoryPanel';

describe('VersionHistoryPanel commercial preview safeguards', () => {
    beforeEach(() => {
        historyMocks.versions = [];
        historyMocks.previewVersion = null;
        historyMocks.loadError = false;
        historyMocks.loadVersions.mockClear();
        historyMocks.saveVersion.mockReset().mockResolvedValue(true);
        historyMocks.enterPreview.mockReset().mockResolvedValue(true);
        historyMocks.exitPreview.mockClear();
        historyMocks.restoreVersion.mockReset().mockResolvedValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses the active English locale and keeps snapshot creation available normally', () => {
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={vi.fn()} />);

        expect(screen.getByText('Version history')).toBeTruthy();
        expect(screen.getByText('No version snapshots yet')).toBeTruthy();
        expect(screen.getByText('Save a snapshot before major changes. Restoring later creates a safety backup first.')).toBeTruthy();
        expect(screen.queryByText(/版本/u)).toBeNull();
        expect((screen.getByLabelText('Snapshot note (optional)') as HTMLInputElement).disabled).toBe(false);
        expect((screen.getByRole('button', { name: /Save snapshot/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('makes version preview read-only and prevents saving a new snapshot', () => {
        historyMocks.previewVersion = { id: 'version-1', message: 'Release candidate' };
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={vi.fn()} />);

        const input = screen.getByLabelText('Snapshot note (optional)') as HTMLInputElement;
        const saveButton = screen.getByRole('button', { name: /Save snapshot/ }) as HTMLButtonElement;

        expect(input.disabled).toBe(true);
        expect(saveButton.disabled).toBe(true);
        expect(screen.getByRole('status').textContent).toContain('Preview is read-only');

        const interactionShield = document.querySelector('.ant-drawer-mask');
        expect(interactionShield).toBeTruthy();
        expect(interactionShield?.getAttribute('style')).toContain('background: transparent');
        expect(interactionShield?.getAttribute('style')).toContain('cursor: not-allowed');

        fireEvent.click(saveButton);
        expect(historyMocks.saveVersion).not.toHaveBeenCalled();
    });

    it('shields the canvas while preview data loads and reads the live canvas lazily', async () => {
        let finishPreview: ((entered: boolean) => void) | undefined;
        historyMocks.enterPreview.mockImplementation(() => new Promise((resolve) => {
            finishPreview = resolve;
        }));
        historyMocks.versions = [{
            id: 'version-1',
            diagramId: 'diagram-1',
            snapshotData: null,
            createdAt: 1,
            message: 'Release candidate',
        }];
        const onClose = vi.fn();
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Preview version: Release candidate' }));
        await waitFor(() => expect(historyMocks.enterPreview).toHaveBeenCalledTimes(1));

        expect(historyMocks.enterPreview).toHaveBeenCalledWith(
            'version-1',
            reactFlowMocks.setNodes,
            reactFlowMocks.setEdges,
            reactFlowMocks.getNodes,
            reactFlowMocks.getEdges,
        );
        expect(document.querySelector('.ant-drawer-mask')).toBeTruthy();
        expect((screen.getByLabelText('Snapshot note (optional)') as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText('Restore version: Release candidate') as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Close version history' }));
        expect(historyMocks.exitPreview).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishPreview?.(false);
        });
    });

    it('does not let an old diagram save completion unlock a new diagram save', async () => {
        let finishFirstSave: ((saved: boolean) => void) | undefined;
        let finishSecondSave: ((saved: boolean) => void) | undefined;
        historyMocks.saveVersion
            .mockImplementationOnce(() => new Promise((resolve) => {
                finishFirstSave = resolve;
            }))
            .mockImplementationOnce(() => new Promise((resolve) => {
                finishSecondSave = resolve;
            }));
        const { rerender } = render(
            <VersionHistoryPanel diagramId="diagram-1" isOpen onClose={vi.fn()} />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Save snapshot/ }));
        await waitFor(() => expect(historyMocks.saveVersion).toHaveBeenCalledTimes(1));

        rerender(<VersionHistoryPanel diagramId="diagram-2" isOpen onClose={vi.fn()} />);
        const saveButton = screen.getByRole('button', { name: /Save snapshot/ });
        expect((saveButton as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(saveButton);
        await waitFor(() => expect(historyMocks.saveVersion).toHaveBeenCalledTimes(2));

        await act(async () => {
            finishFirstSave?.(false);
        });
        expect((screen.getByRole('button', { name: /Save snapshot/ }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: /Save snapshot/ }));
        expect(historyMocks.saveVersion).toHaveBeenCalledTimes(2);

        await act(async () => {
            finishSecondSave?.(false);
        });
        await waitFor(() => {
            expect((screen.getByRole('button', { name: /Save snapshot/ }) as HTMLButtonElement).disabled).toBe(false);
        });
    });

    it('explains that restore is protected by an automatic safety backup', async () => {
        historyMocks.versions = [{
            id: 'version-1',
            diagramId: 'diagram-1',
            snapshotData: null,
            createdAt: 1,
            message: 'Release candidate',
        }];
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={vi.fn()} />);

        fireEvent.click(screen.getByLabelText('Restore version: Release candidate'));

        expect(await screen.findByText('The current canvas will be backed up first. If the backup fails, restore will be cancelled. Restore this version?')).toBeTruthy();
    });

    it('distinguishes a load failure from an empty history and offers an inline retry', () => {
        historyMocks.loadError = true;
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={vi.fn()} />);

        expect(screen.queryByText('No version snapshots yet')).toBeNull();
        expect(screen.getByRole('alert').textContent).toContain('Version history could not be loaded');

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(historyMocks.loadVersions).toHaveBeenCalledTimes(1);

        const css = readFileSync(resolve('src/components/diagrams/ui/VersionHistoryPanel.css'), 'utf8');
        expect(css).toMatch(/\.version-history-load-error \.ant-alert-actions \.ant-btn\s*\{[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
    });

    it('keeps cached snapshots visible and shows retry guidance after refresh fails', () => {
        historyMocks.loadError = true;
        historyMocks.versions = [{
            id: 'version-1',
            diagramId: 'diagram-1',
            snapshotData: null,
            createdAt: 1,
            message: 'Last usable snapshot',
        }];
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={vi.fn()} />);

        expect(screen.getByText('Last usable snapshot')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain('Version history could not be loaded');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(historyMocks.loadVersions).toHaveBeenCalledTimes(1);
    });

    it('returns focus to document actions after the drawer closes', () => {
        let restoreFocus: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            restoreFocus = callback;
            return 1;
        });

        const trigger = document.createElement('button');
        trigger.setAttribute('data-version-history-focus-return', '');
        trigger.textContent = 'Document actions';
        document.body.appendChild(trigger);

        const onClose = vi.fn();
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={onClose} />);
        const closeButton = screen.getByRole('button', { name: 'Close version history' });
        closeButton.focus();

        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(document.activeElement).not.toBe(trigger);

        restoreFocus?.(0);
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });

    it('returns focus to document actions after a successful restore closes the drawer', async () => {
        const pendingFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            pendingFrames.push(callback);
            return pendingFrames.length;
        });
        historyMocks.versions = [{
            id: 'version-1',
            diagramId: 'diagram-1',
            snapshotData: null,
            createdAt: 1,
            message: 'Release candidate',
        }];
        const trigger = document.createElement('button');
        trigger.setAttribute('data-version-history-focus-return', '');
        trigger.textContent = 'Document actions';
        document.body.appendChild(trigger);
        const onClose = vi.fn();

        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Restore version: Release candidate'));
        fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        while (pendingFrames.length > 0) pendingFrames.shift()?.(0);
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });

    it('locks close, preview, save, and additional restores while a restore is pending', async () => {
        let finishRestore: ((success: boolean) => void) | undefined;
        historyMocks.restoreVersion.mockImplementation(() => new Promise((resolve) => {
            finishRestore = resolve;
        }));
        historyMocks.versions = [{
            id: 'version-1',
            diagramId: 'diagram-1',
            snapshotData: null,
            createdAt: 1,
            message: 'Release candidate',
        }];
        const onClose = vi.fn();
        render(<VersionHistoryPanel diagramId="diagram-1" isOpen onClose={onClose} />);

        fireEvent.click(screen.getByLabelText('Restore version: Release candidate'));
        fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
        await waitFor(() => expect(historyMocks.restoreVersion).toHaveBeenCalledTimes(1));

        expect(screen.queryByRole('button', { name: 'Close version history' })).toBeNull();
        expect((screen.getByLabelText('Snapshot note (optional)') as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: /Save snapshot/ }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Preview version: Release candidate' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByLabelText('Restore version: Release candidate') as HTMLButtonElement).disabled).toBe(true);

        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.click(screen.getByRole('button', { name: /Save snapshot/ }));
        expect(onClose).not.toHaveBeenCalled();
        expect(historyMocks.saveVersion).not.toHaveBeenCalled();
        expect(historyMocks.enterPreview).not.toHaveBeenCalled();
        expect(historyMocks.restoreVersion).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishRestore?.(false);
        });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Close version history' })).toBeTruthy());
    });
});
