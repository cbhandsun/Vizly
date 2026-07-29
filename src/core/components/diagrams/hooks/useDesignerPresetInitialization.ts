import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StandardDiagramData } from '../../../models/DiagramModels';
import { getApplicationDiagramRuntime } from '../../../ports/applicationDiagramRuntime';
import { logDesignerSystemSyncPresetLoadFailure } from './designerSystemSyncLogging';

export interface DesignerPresetLookup {
    id?: string;
    ready: boolean;
    preset: StandardDiagramData | null;
}

export const useDesignerPresetInitialization = (id: string | undefined) => {
    const [presetLookup, setPresetLookup] = useState<DesignerPresetLookup>({
        id,
        ready: false,
        preset: null,
    });
    const hasStandardPresetId = getApplicationDiagramRuntime().isStandardPresetId(id);
    const activePresetLookup = useMemo<DesignerPresetLookup>(
        () => (
            !hasStandardPresetId
                ? { id, ready: true, preset: null }
                : presetLookup.id === id
                    ? presetLookup
                    : { id, ready: false, preset: null }
        ),
        [hasStandardPresetId, id, presetLookup],
    );
    const [initializationState, setInitializationState] = useState<{
        id?: string;
        ready: boolean;
    }>({ id, ready: false });
    const isCurrentDiagramInitialized = initializationState.id === id && initializationState.ready;
    const markCurrentDiagramInitialized = useCallback(() => {
        setInitializationState(current => (
            current.id === id && current.ready ? current : { id, ready: true }
        ));
    }, [id]);

    useEffect(() => {
        let cancelled = false;
        if (!hasStandardPresetId) return;

        void getApplicationDiagramRuntime().loadStandardPreset(id).then((preset) => {
            if (!cancelled) setPresetLookup({ id, ready: true, preset });
        }).catch((error) => {
            logDesignerSystemSyncPresetLoadFailure(error);
            if (!cancelled) setPresetLookup({ id, ready: true, preset: null });
        });

        return () => { cancelled = true; };
    }, [hasStandardPresetId, id]);

    return {
        activePresetLookup,
        hasStandardPresetId,
        isCurrentDiagramInitialized,
        markCurrentDiagramInitialized,
    };
};
