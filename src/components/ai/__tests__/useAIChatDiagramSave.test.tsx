import { updateAuthSessionOwner } from '@/context/authSessionBoundary';
import { appMessage } from '@vizly/core/antd';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIChatDiagramSave } from '../useAIChatDiagramSave';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../aiChatSave', () => ({
    prepareAIChatDiagramSave: () => ({ saveTitle: 'Generated', saveJson: '{"nodes":[]}', saveTarget: 'supabase' }),
    executeAIChatDiagramSave: mocks.execute,
}));
vi.mock('@/data/DataRegistry', () => ({ dataRegistry: { getDataService: vi.fn() } }));
vi.mock('@vizly/core/antd', () => ({ appMessage: { loading: () => () => {}, success: vi.fn(), error: vi.fn() } }));
const t = ((key: string, values?: { error?: string }) => values?.error ? `${key}: ${values.error}` : key) as Parameters<typeof useAIChatDiagramSave>[0]['t'];
beforeEach(() => { vi.resetAllMocks(); updateAuthSessionOwner('owner'); });
describe('AI diagram save recovery', () => {
    it('keeps the title and dialog on failure and allows retry', async () => {
        mocks.execute.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce({ title: 'My diagram', target: 'supabase', diagramId: 'saved' });
        const { result } = renderHook(() => useAIChatDiagramSave({ t, userId: 'owner' }));
        act(() => { result.current.handleSaveDiagramTo('{"nodes":[]}', 'supabase'); });
        act(() => { result.current.setSaveTitle('My diagram'); });
        await act(async () => { await result.current.executeSave(); });
        expect(result.current.saveModalVisible).toBe(true);
        expect(result.current.saveTitle).toBe('My diagram');
        expect(result.current.saveError).toContain('aiChat.status.saveFailed');
        expect(result.current.saving).toBe(false);
        await act(async () => { await result.current.executeSave(); });
        expect(result.current.saveModalVisible).toBe(false);
        expect(result.current.saveError).toBe('');
        expect(mocks.execute).toHaveBeenCalledTimes(2);
    });
    it('locks duplicate submissions until the first save completes', async () => {
        let resolve!: (value: unknown) => void;
        mocks.execute.mockImplementation(() => new Promise(done => { resolve = done; }));
        const { result } = renderHook(() => useAIChatDiagramSave({ t, userId: 'owner' }));
        act(() => { result.current.handleSaveDiagramTo('{"nodes":[]}', 'supabase'); });
        let pending!: Promise<void>;
        act(() => { pending = result.current.executeSave(); void result.current.executeSave(); });
        expect(mocks.execute).toHaveBeenCalledOnce();
        expect(result.current.saving).toBe(true);
        await act(async () => { resolve({ title: 'Generated', target: 'supabase', diagramId: 'saved' }); await pending; });
        expect(result.current.saving).toBe(false);
    });
    it('hides the old draft on account change and ignores a late save result', async () => {
        let resolve!: (value: unknown) => void;
        mocks.execute.mockImplementation(() => new Promise(done => { resolve = done; }));
        const { result, rerender } = renderHook(({ userId }) => useAIChatDiagramSave({ t, userId }), { initialProps: { userId: 'owner' } });
        act(() => { result.current.handleSaveDiagramTo('{"nodes":[]}', 'supabase'); });
        let pending!: Promise<void>;
        act(() => { pending = result.current.executeSave(); });
        act(() => { updateAuthSessionOwner('other'); });
        rerender({ userId: 'other' });
        expect(result.current.saveModalVisible).toBe(false);
        expect(result.current.saveTitle).toBe('');
        expect(result.current.saving).toBe(false);
        await act(async () => { resolve({ title: 'Private old draft', target: 'supabase', diagramId: 'old' }); await pending; });
        expect(appMessage.success).not.toHaveBeenCalled();
    });

});
