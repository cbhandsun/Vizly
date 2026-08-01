// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
    isConfigured: vi.fn(),
    provider: { id: 'supabase', saveDiagram: vi.fn() },
}));

const messageMocks = vi.hoisted(() => ({
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    hideLoading: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
    get: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
    cloudSaveFailure: vi.fn(),
}));

vi.mock('@/services/UnifiedStorageService', () => ({
    unifiedStorage: {
        isConfigured: storageMocks.isConfigured,
        get activeProvider() {
            return storageMocks.provider;
        },
    },
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: messageMocks.error,
        loading: messageMocks.loading,
        success: messageMocks.success,
    },
}));

vi.mock('@/core/utils/flowDataBridge', () => ({
    getFlowDataBridge: bridgeMocks.get,
}));

vi.mock('@/core/utils/coerceDiagram', () => ({
    coerceToStandardDiagramData: (value: unknown) => value,
}));

vi.mock('@/core/utils/diagramSnapshot', () => ({
    tryAttachDiagramSnapshot: vi.fn(async (diagram: unknown) => ({ diagram })),
}));

vi.mock('@/services/remoteDiagramPreview', () => ({
    invalidateRemoteDiagramPreview: vi.fn(),
}));

vi.mock('../diagramStorageLogging', () => ({
    logCloudSaveFailure: loggingMocks.cloudSaveFailure,
}));

import { useCloudSave } from '../useCloudSave';

interface TestBridge {
    id: string;
    name: string;
    nodes: Array<{ id: string }>;
    edges: unknown[];
    metadata?: {
        title?: string;
        cloud?: {
            provider: 'supabase' | 's3';
            id: string;
            title?: string;
        };
    };
}

const createBridge = (): TestBridge => ({
    id: '11111111-1111-4111-8111-111111111111',
    name: '旧标题',
    nodes: [{ id: 'node-1' }],
    edges: [],
    metadata: { title: '旧标题' },
});

describe('useCloudSave', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storageMocks.isConfigured.mockReturnValue(true);
        storageMocks.provider.saveDiagram.mockResolvedValue(undefined);
        messageMocks.loading.mockReturnValue(messageMocks.hideLoading);
        bridgeMocks.get.mockReturnValue(createBridge());
    });

    it('rejects without showing a loading state when cloud storage is not configured', async () => {
        storageMocks.isConfigured.mockReturnValue(false);
        const { result } = renderHook(() => useCloudSave('diagram-1', '客户流程'));

        await expect(result.current.saveToCloud()).rejects.toThrow('云存储未配置');

        expect(messageMocks.error).toHaveBeenCalledTimes(1);
        expect(messageMocks.error).toHaveBeenCalledWith('云存储未配置，请先在设置中配置');
        expect(messageMocks.loading).not.toHaveBeenCalled();
        expect(storageMocks.provider.saveDiagram).not.toHaveBeenCalled();
    });

    it.each([
        ['missing bridge', null],
        ['empty nodes', { ...createBridge(), nodes: [] }],
    ])('rejects when diagram data is %s', async (_label, bridge) => {
        bridgeMocks.get.mockReturnValue(bridge);
        const { result } = renderHook(() => useCloudSave('diagram-1'));

        await expect(result.current.saveToCloud()).rejects.toThrow('未找到图表数据');

        expect(messageMocks.error).toHaveBeenCalledTimes(1);
        expect(messageMocks.loading).not.toHaveBeenCalled();
        expect(storageMocks.provider.saveDiagram).not.toHaveBeenCalled();
    });

    it('rejects provider failures, reports them once, and always closes loading', async () => {
        const providerError = new Error('provider unavailable');
        storageMocks.provider.saveDiagram.mockRejectedValue(providerError);
        const { result } = renderHook(() => useCloudSave('diagram-1', '客户流程'));

        await expect(result.current.saveToCloud()).rejects.toBe(providerError);

        expect(loggingMocks.cloudSaveFailure).toHaveBeenCalledWith('useCloudSave', providerError);
        expect(messageMocks.error).toHaveBeenCalledTimes(1);
        expect(messageMocks.error).toHaveBeenCalledWith('保存到云端失败');
        expect(messageMocks.hideLoading).toHaveBeenCalledTimes(1);
        expect(messageMocks.success).not.toHaveBeenCalled();
    });

    it('saves successfully and writes the cloud identity back to the bridge', async () => {
        const bridge = createBridge();
        bridgeMocks.get.mockReturnValue(bridge);
        const { result } = renderHook(() => useCloudSave('diagram-1', '客户流程'));

        await act(async () => {
            await result.current.saveToCloud();
        });

        expect(storageMocks.provider.saveDiagram).toHaveBeenCalledWith(expect.objectContaining({
            id: bridge.id,
            title: '客户流程',
            content: expect.objectContaining({ id: bridge.id, name: '客户流程' }),
        }));
        expect(bridge.metadata?.cloud).toEqual({
            provider: 'supabase',
            id: bridge.id,
            title: '客户流程',
        });
        expect(messageMocks.success).toHaveBeenCalledWith('已保存到云端');
        expect(messageMocks.error).not.toHaveBeenCalled();
        expect(messageMocks.hideLoading).toHaveBeenCalledTimes(1);
    });

    it('returns false from ensureSaved when the underlying save rejects', async () => {
        storageMocks.provider.saveDiagram.mockRejectedValue(new Error('provider unavailable'));
        const { result } = renderHook(() => useCloudSave('diagram-1'));

        let savedId: string | false = 'unexpected';
        await act(async () => {
            savedId = await result.current.ensureSaved();
        });

        expect(savedId).toBe(false);
        expect(messageMocks.error).toHaveBeenCalledTimes(1);
    });
});
