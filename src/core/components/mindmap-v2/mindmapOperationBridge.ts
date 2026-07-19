import type { MindElixirInstance, NodeObj } from 'mind-elixir';

type MindElixirArrow = MindElixirInstance['arrows'][number];

export type VizlyMindMapOperation =
    | { name: 'autoArrangeMindmap'; obj: NodeObj }
    | { name: 'editArrowLabel'; obj: MindElixirArrow };

type OperationEmitter = (event: 'operation', operation: VizlyMindMapOperation) => void;

export const emitVizlyMindMapOperation = (
    mind: Pick<MindElixirInstance, 'bus'>,
    operation: VizlyMindMapOperation,
): void => {
    // mind-elixir's public operation union cannot be extended, although its
    // runtime pubsub accepts application operations. Keep that cast here.
    const emit = mind.bus.fire as unknown as OperationEmitter;
    emit('operation', operation);
};
