// @vitest-environment jsdom

import { act, render, renderHook, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    bridge: { nodes: [], metadata: {} } as Record<string, unknown> | null,
    confirm: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => vi.fn()),
    success: vi.fn(),
}));

vi.mock('@/core/utils/customPresetStorage', () => ({ addCustomPreset: vi.fn() }));
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

const t = ((key: string) => key) as unknown as TFunction;

describe('useDiagramViewerSaveActions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.bridge = { nodes: [], metadata: {} };
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
            content: ReactNode;
            okText: string;
            cancelText: string;
        };
        render(<>{config.content}</>);

        const input = screen.getByRole('textbox', {
            name: 'diagramViewer.saveAs.nameLabel',
        }) as HTMLInputElement;
        expect(input.value).toBe('diagramViewer.saveAs.defaultName');
        expect(config.okText).toBe('common.confirm');
        expect(config.cancelText).toBe('common.cancel');
    });
});
