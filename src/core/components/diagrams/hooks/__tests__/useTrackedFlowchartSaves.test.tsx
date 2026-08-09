// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { useTrackedFlowchartSaves } from '../useTrackedFlowchartSaves';

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
});
