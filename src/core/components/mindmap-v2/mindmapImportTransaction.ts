import type { MindElixirInstance } from 'mind-elixir';

import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

import {
    emitVizlyMindMapOperation,
    refreshVizlyMindMapData,
    type VizlyMindMapData,
} from './mindmapOperationBridge';

/**
 * Replace the current map as one native history transaction.
 *
 * Mind Elixir keeps the previous snapshot internally until an operation is
 * published. Refreshing first and then publishing `import` therefore makes
 * the full replacement undoable without discarding the user's earlier undo
 * history. The same operation also drives Vizly's save and version-history
 * effects.
 */
export const applyMindMapImportTransaction = (
    mind: MindElixirInstance,
    data: VizlyMindMapData,
): void => {
    const previousData = mind.getData();
    refreshVizlyMindMapData(mind, data);
    try {
        emitVizlyMindMapOperation(mind, {
            name: 'import',
            obj: data.nodeData,
        });
    } catch (operationError) {
        try {
            refreshVizlyMindMapData(mind, previousData);
        } catch (rollbackError) {
            throw new AggregateError(
                [operationError, rollbackError],
                'Mind map import failed and could not restore the previous map.',
                { cause: rollbackError },
            );
        }
        throw operationError;
    }
    try {
        mind.toCenter();
    } catch (error) {
        safeLog.warn(
            '[MindMapImport] viewport centering failed after a successful import:',
            redactSensitiveLogValue(error),
        );
    }
};
