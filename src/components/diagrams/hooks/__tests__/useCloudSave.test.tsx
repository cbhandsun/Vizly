// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
    isConfigured: vi.fn(),
    provider: { id: 'supabase', saveDiagram: vi.fn() },
}));

const authMocks = vi.hoisted(() => ({
    user: { id: 'user-1' } as { id: string } | null,
}));

const messageMocks = vi.hoisted(() => ({
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    hideLoading: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
    get: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
    cloudSaveFailure: vi.fn(),
}));

const recoveryMocks = vi.hoisted(() => ({
    showConfiguration: vi.fn(),
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
        warning: messageMocks.warning,
    },
}));

vi.mock('@/context/useAuth', () => ({
    useAuth: () => ({ user: authMocks.user }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
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

vi.mock('../cloudSaveRecovery', () => ({
    showCloudSaveConfigurationRecovery: recoveryMocks.showConfiguration,
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
        storageMocks.provider.id = 'supabase';
        storageMocks.provider.saveDiagram.mockResolvedValue(undefined);
        authMocks.user = { id: 'user-1' };
        messageMocks.loading.mockReturnValue(messageMocks.hideLoading);
        bridgeMocks.get.mockReturnValue(createBridge());
    });

    it('opens authentication before a Supabase save and cancels without reporting a save', async () => {
        authMocks.user = null;
        let restoreFocus: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            restoreFocus = callback;
            return 1;
        });
        const trigger = document.createElement('button');
        trigger.dataset.cloudSaveFocusReturn = 'true';
        document.body.appendChild(trigger);
        const menuItem = document.createElement('button');
        document.body.appendChild(menuItem);
        menuItem.focus();
        const { result } = renderHook(() => useCloudSave('diagram-1', '客户流程'));

        let savePromise: Promise<void | 'cancelled'> | undefined;
        await act(async () => {
            savePromise = result.current.saveToCloud();
            await Promise.resolve();
        });
        menuItem.remove();

        expect(result.current.cloudSaveAuthOpen).toBe(true);
        expect(messageMocks.warning).toHaveBeenCalledWith('storage.manager.needLoginForSupabase');
        expect(storageMocks.provider.saveDiagram).not.toHaveBeenCalled();

        act(() => result.current.cancelCloudSaveAuthentication());
        await expect(savePromise).resolves.toBe('cancelled');
        act(() => result.current.restoreCloudSaveFocus());
        act(() => restoreFocus?.(0));

        expect(result.current.cloudSaveAuthOpen).toBe(false);
        expect(document.activeElement).toBe(trigger);
        expect(messageMocks.success).not.toHaveBeenCalled();
        trigger.remove();
    });

    it('continues the pending Supabase save once authentication succeeds', async () => {
        authMocks.user = null;
        const { result } = renderHook(() => useCloudSave('diagram-1', '客户流程'));

        let savePromise: Promise<void | 'cancelled'> | undefined;
        await act(async () => {
            savePromise = result.current.saveToCloud();
            await Promise.resolve();
        });
        act(() => result.current.completeCloudSaveAuthentication());
        await act(async () => {
            await savePromise;
        });

        expect(storageMocks.provider.saveDiagram).toHaveBeenCalledTimes(1);
        expect(messageMocks.success).toHaveBeenCalledWith('已保存到云端');
        expect(result.current.cloudSaveAuthOpen).toBe(false);
    });

    it('keeps the configured S3 save path available without account authentication', async () => {
        authMocks.user = null;
        storageMocks.provider.id = 's3';
        const { result } = renderHook(() => useCloudSave('diagram-1', '客户流程'));

        await act(async () => {
            await result.current.saveToCloud();
        });

        expect(storageMocks.provider.saveDiagram).toHaveBeenCalledTimes(1);
        expect(result.current.cloudSaveAuthOpen).toBe(false);
        expect(messageMocks.warning).not.toHaveBeenCalled();
    });

    it('offers configuration recovery without marking the local diagram as failed', async () => {
        storageMocks.isConfigured.mockReturnValue(false);
        const { result } = renderHook(() => useCloudSave('diagram-1', '客户流程'));

        await expect(result.current.saveToCloud()).resolves.toBe('cancelled');

        expect(recoveryMocks.showConfiguration).toHaveBeenCalledWith({
            title: 'storage.manager.providerNotConfigured',
            description: 'storage.manager.cloudSaveConfigureHint',
            actionLabel: 'storage.manager.goConfig',
        });
        expect(messageMocks.error).not.toHaveBeenCalled();
        expect(messageMocks.loading).not.toHaveBeenCalled();
        expect(storageMocks.provider.saveDiagram).not.toHaveBeenCalled();
    });

    it('reports provider bootstrap failures before rethrowing them to the tracked save boundary', async () => {
        const bootstrapError = new Error('storage bootstrap failed');
        storageMocks.isConfigured.mockImplementation(() => {
            throw bootstrapError;
        });
        const { result } = renderHook(() => useCloudSave('diagram-1', '客户流程'));

        await expect(result.current.saveToCloud()).rejects.toBe(bootstrapError);

        expect(loggingMocks.cloudSaveFailure).toHaveBeenCalledWith('useCloudSave.bootstrap', bootstrapError);
        expect(messageMocks.error).toHaveBeenCalledWith('storage.manager.cloudSaveUnavailable');
        expect(recoveryMocks.showConfiguration).not.toHaveBeenCalled();
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

    it('restores focus to the share trigger after the dialog closes', () => {
        let restoreFocus: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            restoreFocus = callback;
            return 1;
        });
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();
        const { result } = renderHook(() => useCloudSave('diagram-1'));

        act(() => result.current.openShareDialog());
        expect(result.current.shareDialogOpen).toBe(true);
        document.body.focus();
        act(() => result.current.closeShareDialog());
        act(() => restoreFocus?.(0));

        expect(result.current.shareDialogOpen).toBe(false);
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });

    it('captures the declared share trigger when pointer activation leaves focus on the page body', () => {
        let restoreFocus: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            restoreFocus = callback;
            return 1;
        });
        const trigger = document.createElement('button');
        trigger.dataset.shareDialogTrigger = '';
        document.body.appendChild(trigger);
        const { result } = renderHook(() => useCloudSave('diagram-1'));

        act(() => result.current.openShareDialog());
        act(() => result.current.closeShareDialog());
        act(() => restoreFocus?.(0));

        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });

    it('does not move focus when the original share trigger is no longer connected', () => {
        let restoreFocus: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            restoreFocus = callback;
            return 1;
        });
        const trigger = document.createElement('button');
        const fallback = document.createElement('button');
        document.body.append(trigger, fallback);
        trigger.focus();
        const { result } = renderHook(() => useCloudSave('diagram-1'));

        act(() => result.current.openShareDialog());
        trigger.remove();
        fallback.focus();
        act(() => result.current.closeShareDialog());
        act(() => restoreFocus?.(0));

        expect(document.activeElement).toBe(fallback);
        fallback.remove();
    });
});
