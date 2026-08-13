import type { NodeObj } from 'mind-elixir';

import { addHistoryRecord, parseHistoryNodeData, serializeHistoryNodeData } from './mindmapHistoryStore';
import type { HistoryRecord } from './mindmapHistoryStore';

export interface MindMapHistoryRestoreDependencies {
    recordHistory: typeof addHistoryRecord;
}

const DEFAULT_DEPENDENCIES: MindMapHistoryRestoreDependencies = {
    recordHistory: addHistoryRecord,
};

const cloneHistoryNodeData = (nodeData: NodeObj): NodeObj => (
    parseHistoryNodeData(serializeHistoryNodeData(nodeData))
);

const fireHistoryRestoreOperation = (
    mind: { bus: unknown },
    operation: { name: 'restore_version'; obj: NodeObj; origin: NodeObj },
): void => {
    const bus: unknown = mind.bus;
    if (typeof bus !== 'object' || bus === null) {
        throw new Error('Mind map operation bus is unavailable');
    }
    const fire = Reflect.get(bus, 'fire');
    if (typeof fire !== 'function') {
        throw new Error('Mind map operation bus cannot publish events');
    }
    Reflect.apply(fire, bus, ['operation', operation]);
};

export const restoreMindMapHistoryRecord = <TData extends { nodeData: NodeObj }>({
    mind,
    record,
    backupDescription,
    dependencies: overrides = {},
}: {
    mind: {
        getData: () => TData;
        refresh: (data: TData) => void;
        toCenter: () => void;
        bus: unknown;
    };
    record: HistoryRecord;
    backupDescription: string;
    dependencies?: Partial<MindMapHistoryRestoreDependencies>;
}): void => {
    const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
    const restoredNodeData = parseHistoryNodeData(record.data);
    const currentData = mind.getData();
    const previousNodeData = cloneHistoryNodeData(currentData.nodeData);

    // The restore must never be the first destructive mutation in the transaction.
    // Duplicate suppression keeps this cheap when the current state is already recorded.
    dependencies.recordHistory(backupDescription, previousNodeData);

    try {
        mind.refresh({
            ...currentData,
            nodeData: restoredNodeData,
        });
        mind.toCenter();
        fireHistoryRestoreOperation(mind, {
            name: 'restore_version',
            obj: restoredNodeData,
            origin: previousNodeData,
        });
    } catch (error) {
        // A downstream failure must not leave a partially restored canvas behind.
        try {
            mind.refresh({
                ...currentData,
                nodeData: previousNodeData,
            });
            mind.toCenter();
        } catch {
            // Preserve the original failure for the centralized, redacted logger.
        }
        throw error;
    }
};
