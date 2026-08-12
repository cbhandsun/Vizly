import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { Edge, Node } from '@xyflow/react';

import type { DiagramTypePlugin, PluginContext } from '@/core/types/plugin';
import type { DiagramSaveResult } from '@/core/types/diagram-components';
import type { AutoSaveState } from './useAutoSave';
import { runFlowchartSavePipeline } from '../flowchartSavePipeline';
import { logTrackedFlowchartSaveFailure } from './flowchartSaveLogging';

export type FlowchartSaveTarget = 'local' | 'cloud';

interface ManualSaveStatus {
    target: FlowchartSaveTarget;
    state: AutoSaveState;
    updatedAt: number;
}

export interface DisplayedFlowchartSaveStatus {
    target: FlowchartSaveTarget;
    state: AutoSaveState;
}

export const selectDisplayedFlowchartSaveStatus = (
    localState: AutoSaveState,
    manualStatus: ManualSaveStatus | null,
): DisplayedFlowchartSaveStatus => {
    if (manualStatus?.state.saving) {
        return { target: manualStatus.target, state: manualStatus.state };
    }
    if (localState.saving || localState.error) {
        return { target: 'local', state: localState };
    }
    if (manualStatus && manualStatus.updatedAt > (localState.lastSaved ?? 0)) {
        return { target: manualStatus.target, state: manualStatus.state };
    }
    return { target: 'local', state: localState };
};

interface UseTrackedFlowchartSavesOptions {
    activePlugin?: Pick<DiagramTypePlugin, 'onDataSync'> | null;
    pluginCtx?: PluginContext | null;
    nodesRef: RefObject<Node[]>;
    edgesRef: RefObject<Edge[]>;
    localSaveState: AutoSaveState;
    onCloudSave?: () => Promise<DiagramSaveResult>;
    onDirectSave?: () => Promise<void>;
}

export const useTrackedFlowchartSaves = ({
    activePlugin,
    pluginCtx,
    nodesRef,
    edgesRef,
    localSaveState,
    onCloudSave,
    onDirectSave,
}: UseTrackedFlowchartSavesOptions) => {
    const [manualStatus, setManualStatus] = useState<ManualSaveStatus | null>(null);

    const runTrackedSave = useCallback(async (
        target: FlowchartSaveTarget,
        saveAction: (() => Promise<DiagramSaveResult>) | undefined,
    ) => {
        const startedAt = Date.now();
        setManualStatus({
            target,
            updatedAt: startedAt,
            state: { saving: true, lastSaved: null, error: null },
        });
        try {
            const result = await runFlowchartSavePipeline({
                activePlugin,
                pluginCtx,
                nodes: nodesRef.current ?? [],
                edges: edgesRef.current ?? [],
                saveAction,
            });
            if (result === 'cancelled') {
                setManualStatus(null);
                return;
            }
            const savedAt = Date.now();
            setManualStatus({
                target,
                updatedAt: savedAt,
                state: { saving: false, lastSaved: savedAt, error: null },
            });
        } catch (error) {
            setManualStatus({
                target,
                updatedAt: Date.now(),
                state: { saving: false, lastSaved: null, error: 'save-failed' },
            });
            logTrackedFlowchartSaveFailure(target, error);
        }
    }, [activePlugin, edgesRef, nodesRef, pluginCtx]);

    const handleCloudSave = useCallback(
        () => runTrackedSave('cloud', onCloudSave),
        [onCloudSave, runTrackedSave],
    );
    const handleDirectSave = useCallback(
        () => runTrackedSave('local', onDirectSave),
        [onDirectSave, runTrackedSave],
    );
    const displayedStatus = useMemo(
        () => selectDisplayedFlowchartSaveStatus(localSaveState, manualStatus),
        [localSaveState, manualStatus],
    );

    return {
        displayedSaveState: displayedStatus.state,
        displayedSaveTarget: displayedStatus.target,
        handleCloudSave,
        handleDirectSave,
    };
};
