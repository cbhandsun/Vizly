// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { useTrackedFlowchartSaves } from '../useTrackedFlowchartSaves';

const loggingMocks = vi.hoisted(() => ({
    saveFailure: vi.fn(),
}));

vi.mock('../flowchartSaveLogging', () => ({
    logTrackedFlowchartSaveFailure: loggingMocks.saveFailure,
}));

describe('useTrackedFlowchartSaves', () => {
    it('coalesces repeated and cross-target saves until the active operation settles', async () => {
        let releaseCloudSave = () => {};
        const cloudSavePromise = new Promise<void>((resolve) => {
            releaseCloudSave = resolve;
        });
        const onCloudSave = vi.fn(() => cloudSavePromise);
        const onDirectSave = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useTrackedFlowchartSaves({
            activePlugin: null,
            pluginCtx: null,
            nodesRef: { current: [] as Node[] },
            edgesRef: { current: [] as Edge[] },
            localSaveState: { saving: false, lastSaved: 123, error: null },
            onCloudSave,
            onDirectSave,
        }));

        let firstSave: Promise<void> | null = null;
        let duplicateSave: Promise<void> | null = null;
        let crossTargetSave: Promise<void> | null = null;
        act(() => {
            firstSave = result.current.handleCloudSave();
            duplicateSave = result.current.handleCloudSave();
            crossTargetSave = result.current.handleDirectSave();
        });

        expect(firstSave).not.toBeNull();
        expect(duplicateSave).toBe(firstSave);
        expect(crossTargetSave).toBe(firstSave);
        expect(onCloudSave).toHaveBeenCalledTimes(1);
        expect(onDirectSave).not.toHaveBeenCalled();
        expect(result.current.displayedSaveTarget).toBe('cloud');
        expect(result.current.displayedSaveState.saving).toBe(true);

        await act(async () => {
            releaseCloudSave();
            await firstSave;
        });

        await act(async () => {
            await result.current.handleDirectSave();
        });
        expect(onDirectSave).toHaveBeenCalledTimes(1);
        expect(result.current.displayedSaveTarget).toBe('local');
        expect(result.current.displayedSaveState.saving).toBe(false);
    });

    it('returns to the local status when an authentication flow cancels a cloud save', async () => {
        const localSaveState = { saving: false, lastSaved: 123, error: null };
        const { result } = renderHook(() => useTrackedFlowchartSaves({
            activePlugin: null,
            pluginCtx: null,
            nodesRef: { current: [] as Node[] },
            edgesRef: { current: [] as Edge[] },
            localSaveState,
            onCloudSave: async () => 'cancelled',
        }));

        await act(async () => {
            await result.current.handleCloudSave();
        });

        expect(result.current.displayedSaveTarget).toBe('local');
        expect(result.current.displayedSaveState).toEqual(localSaveState);
    });

    it('contains rejected UI save actions after exposing a visible failed state', async () => {
        const saveError = new Error('provider unavailable');
        const onCloudSave = vi.fn(async () => {
            throw saveError;
        });
        const { result } = renderHook(() => useTrackedFlowchartSaves({
            activePlugin: null,
            pluginCtx: null,
            nodesRef: { current: [] as Node[] },
            edgesRef: { current: [] as Edge[] },
            localSaveState: { saving: false, lastSaved: 123, error: null },
            onCloudSave,
        }));

        await act(async () => {
            await expect(result.current.handleCloudSave()).resolves.toBeUndefined();
        });

        expect(result.current.displayedSaveTarget).toBe('cloud');
        expect(result.current.displayedSaveState.error).toBe('save-failed');
        expect(loggingMocks.saveFailure).toHaveBeenCalledWith('cloud', saveError);

        await act(async () => {
            await expect(result.current.handleCloudSave()).resolves.toBeUndefined();
        });
        expect(onCloudSave).toHaveBeenCalledTimes(2);
    });
});
