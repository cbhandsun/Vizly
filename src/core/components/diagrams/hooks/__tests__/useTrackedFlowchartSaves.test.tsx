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
        const { result } = renderHook(() => useTrackedFlowchartSaves({
            activePlugin: null,
            pluginCtx: null,
            nodesRef: { current: [] as Node[] },
            edgesRef: { current: [] as Edge[] },
            localSaveState: { saving: false, lastSaved: 123, error: null },
            onCloudSave: async () => {
                throw saveError;
            },
        }));

        await act(async () => {
            await expect(result.current.handleCloudSave()).resolves.toBeUndefined();
        });

        expect(result.current.displayedSaveTarget).toBe('cloud');
        expect(result.current.displayedSaveState.error).toBe('save-failed');
        expect(loggingMocks.saveFailure).toHaveBeenCalledWith('cloud', saveError);
    });
});
