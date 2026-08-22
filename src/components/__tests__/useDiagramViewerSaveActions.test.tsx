// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    bridge: { nodes: [], metadata: {} } as Record<string, unknown> | null,
    addCustomPreset: vi.fn(),
    confirm: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => vi.fn()),
    modalDestroy: vi.fn(),
    modalUpdate: vi.fn(),
    getCustomPreset: vi.fn(),
    success: vi.fn(),
}));

vi.mock('@/core/utils/customPresetStorage', () => ({
    addCustomPreset: mocks.addCustomPreset,
    CUSTOM_PRESET_NAME_MAX_LENGTH: 120,
    getCustomPreset: mocks.getCustomPreset,
}));
vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: mocks.error,
        info: mocks.info,
        loading: mocks.loading,
        success: mocks.success,
    },
    appModal: { confirm: mocks.confirm },
}));
vi.mock('@/core/utils/diagramSnapshot', () => ({ tryAttachDiagramSnapshot: vi.fn() }));
vi.mock('@/core/utils/flowDataBridge', () => ({
    getFlowDataBridge: () => mocks.bridge,
}));
vi.mock('@/services/remoteDiagramPreview', () => ({ invalidateRemoteDiagramPreview: vi.fn() }));
vi.mock('../diagramViewerLogging', () => ({
    logDiagramViewerDirectSaveFailure: vi.fn(),
    logDiagramViewerSaveAsFailure: vi.fn(),
}));

import { useDiagramViewerSaveActions } from '../useDiagramViewerSaveActions';

const t = ((key: string, options?: { target?: string }) => (
    options?.target ? `${key}:${options.target}` : key
)) as unknown as TFunction;

describe('useDiagramViewerSaveActions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.bridge = { nodes: [], metadata: {} };
        mocks.addCustomPreset.mockReturnValue({ nodes: [] });
        mocks.getCustomPreset.mockReturnValue(null);
        mocks.confirm.mockReturnValue({
            destroy: mocks.modalDestroy,
            update: mocks.modalUpdate,
        });
    });

    it('does not silently turn direct save into a Supabase Save As flow', async () => {
        const { result } = renderHook(() => useDiagramViewerSaveActions({
            selectedDiagramId: 'diagram-1',
            t,
            onCloudReplicaSaved: vi.fn(),
        }));

        await act(async () => result.current.handleDirectSave());

        expect(mocks.info).toHaveBeenCalledWith('diagramViewer.directSave.locationRequired');
        expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it('names the Save As input and localizes the dialog actions', async () => {
        const { result } = renderHook(() => useDiagramViewerSaveActions({
            selectedDiagramId: 'diagram-1',
            t,
            onCloudReplicaSaved: vi.fn(),
        }));

        await act(async () => result.current.handleSaveTo('local'));
        const config = mocks.confirm.mock.calls[0]?.[0] as {
            title: string;
            content: ReactNode;
            okText: string;
            cancelText: string;
        };
        render(<>{config.content}</>);

        const input = screen.getByRole('textbox', {
            name: 'diagramViewer.saveAs.nameLabel',
        }) as HTMLInputElement;
        expect(input.value).toBe('diagramViewer.saveAs.defaultName');
        expect(config.title).toBe('diagramViewer.saveAs.title:workspace.local');
        expect(config.okText).toBe('common.confirm');
        expect(config.cancelText).toBe('common.cancel');
        expect(input.maxLength).toBe(120);
        expect(screen.getByText(/\/ 120$/)).toBeTruthy();
    });

    it('keeps the Save As dialog open and reports an oversized name accurately', async () => {
        const { result } = renderHook(() => useDiagramViewerSaveActions({
            selectedDiagramId: 'diagram-1',
            t,
            onCloudReplicaSaved: vi.fn(),
        }));

        await act(async () => result.current.handleSaveTo('s3'));
        const config = mocks.confirm.mock.calls[0]?.[0] as {
            content: ReactNode;
            okButtonProps: { onClick: () => void };
        };
        render(<>{config.content}</>);

        const input = screen.getByRole('textbox', {
            name: 'diagramViewer.saveAs.nameLabel',
        });
        fireEvent.change(input, { target: { value: 'x'.repeat(501) } });

        config.okButtonProps.onClick();
        expect(mocks.error).toHaveBeenCalledWith('diagramViewer.saveAs.nameTooLong');
        expect(mocks.modalDestroy).not.toHaveBeenCalled();
        await waitFor(() => expect(document.activeElement).toBe(input));
    });

    it('requires explicit confirmation before replacing an existing local copy', async () => {
        mocks.getCustomPreset.mockReturnValue({ id: 'existing', nodes: [] });
        const { result } = renderHook(() => useDiagramViewerSaveActions({
            selectedDiagramId: 'diagram-1',
            t,
            onCloudReplicaSaved: vi.fn(),
        }));

        await act(async () => result.current.handleSaveTo('local'));
        const saveAsConfig = mocks.confirm.mock.calls[0]?.[0] as {
            content: ReactNode;
            okButtonProps: { onClick: () => void };
        };
        render(<>{saveAsConfig.content}</>);
        const input = screen.getByRole('textbox', {
            name: 'diagramViewer.saveAs.nameLabel',
        });
        fireEvent.change(input, { target: { value: 'Existing local copy' } });

        saveAsConfig.okButtonProps.onClick();

        expect(mocks.addCustomPreset).not.toHaveBeenCalled();
        const overwriteConfig = mocks.confirm.mock.calls[1]?.[0] as {
            title: string;
            content: string;
            okText: string;
            cancelText: string;
            okButtonProps: { danger: boolean };
            onOk: () => Promise<void>;
            onCancel: () => void;
            afterClose: () => void;
        };
        expect(overwriteConfig).toMatchObject({
            title: 'diagramViewer.saveAs.overwriteTitle',
            content: 'diagramViewer.saveAs.overwriteDescription',
            okText: 'diagramViewer.saveAs.replace',
            cancelText: 'diagramViewer.saveAs.keepEditing',
            okButtonProps: { danger: true },
        });

        overwriteConfig.onCancel();
        overwriteConfig.afterClose();
        expect(mocks.modalDestroy).not.toHaveBeenCalled();
        await waitFor(() => expect(document.activeElement).toBe(input));

        saveAsConfig.okButtonProps.onClick();
        const confirmedOverwriteConfig = mocks.confirm.mock.calls[2]?.[0] as {
            onOk: () => Promise<void>;
        };
        await act(async () => confirmedOverwriteConfig.onOk());

        expect(mocks.addCustomPreset).toHaveBeenCalledWith(
            'Existing local copy',
            expect.objectContaining({ name: 'Existing local copy' }),
        );
        expect(mocks.modalDestroy).toHaveBeenCalledTimes(1);
        expect(mocks.success).toHaveBeenCalledWith('diagramViewer.saveAs.localSuccess');
    });
});
