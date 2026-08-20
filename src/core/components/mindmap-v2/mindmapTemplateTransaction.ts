import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

import {
    emitVizlyMindMapOperation,
    refreshVizlyMindMapData,
    type VizlyMindMapData,
} from './mindmapOperationBridge';

export const applyMindMapTemplateTransaction = (
    mind: MindElixirInstance,
    nodeData: NodeObj,
): void => {
    const previousData = mind.getData();
    const replacement: VizlyMindMapData = {
        nodeData,
        direction: previousData.direction,
    };

    refreshVizlyMindMapData(mind, replacement);
    try {
        emitVizlyMindMapOperation(mind, {
            name: 'template_apply',
            obj: nodeData,
        });
    } catch (operationError) {
        try {
            refreshVizlyMindMapData(mind, previousData);
        } catch (rollbackError) {
            throw new AggregateError(
                [operationError, rollbackError],
                'Mind map template application failed and could not restore the previous map.',
                { cause: rollbackError },
            );
        }
        throw operationError;
    }

    try {
        mind.toCenter();
    } catch (error) {
        safeLog.warn(
            '[MindMapTemplates] viewport centering failed after applying a template:',
            redactSensitiveLogValue(error),
        );
    }
};
