import {
    clearFlowchartCache,
    type FlowchartCacheClearResult,
} from './clearFlowchartCache';
import {
    coerceDiagramId,
    getQueryOrHashParamFromLocation,
    type LocationLike,
} from './inputBoundary';

const SELECTED_DIAGRAM_STORAGE_KEY = 'diagramMenu.selectedDiagramId';

export type LocalEditorResetResult =
    | {
        ok: true;
        diagramId: string;
        removedCount: number;
    }
    | {
        ok: false;
        reason: 'diagram-id-unavailable' | 'cache-clear-failed';
        failureCount: number;
    };

interface LocalEditorResetDependencies {
    clearCache?: (diagramId: string) => FlowchartCacheClearResult;
    location: LocationLike | null | undefined;
    storage: Pick<Storage, 'getItem'>;
}

interface ConfirmedLocalEditorResetDependencies extends LocalEditorResetDependencies {
    close: () => void;
    onFailure: (result: Extract<LocalEditorResetResult, { ok: false }>) => void;
    reload: () => void;
}

export const resolveLocalEditorResetDiagramId = (
    location: LocationLike | null | undefined,
    storage: Pick<Storage, 'getItem'>,
): string | null => {
    const locationDiagramId = coerceDiagramId(
        getQueryOrHashParamFromLocation(location, 'diagram'),
    );
    if (locationDiagramId) return locationDiagramId;

    try {
        return coerceDiagramId(storage.getItem(SELECTED_DIAGRAM_STORAGE_KEY)) || null;
    } catch {
        return null;
    }
};

export const resetLocalEditorState = ({
    clearCache = clearFlowchartCache,
    location,
    storage,
}: LocalEditorResetDependencies): LocalEditorResetResult => {
    const diagramId = resolveLocalEditorResetDiagramId(location, storage);
    if (!diagramId) {
        return {
            ok: false,
            reason: 'diagram-id-unavailable',
            failureCount: 0,
        };
    }

    const clearResult = clearCache(diagramId);
    if (!clearResult.ok) {
        return {
            ok: false,
            reason: 'cache-clear-failed',
            failureCount: clearResult.failures.length,
        };
    }

    return {
        ok: true,
        diagramId,
        removedCount: clearResult.removedCount,
    };
};

export const executeConfirmedLocalEditorReset = (
    dependencies: ConfirmedLocalEditorResetDependencies,
): LocalEditorResetResult => {
    const result = resetLocalEditorState(dependencies);
    if (!result.ok) {
        dependencies.onFailure(result);
        return result;
    }

    dependencies.close();
    dependencies.reload();
    return result;
};
