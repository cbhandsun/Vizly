import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir';

type MindElixirArrow = MindElixirInstance['arrows'][number];

export type VizlyMindMapOperation =
    | { name: 'autoArrangeMindmap'; obj: NodeObj }
    | { name: 'changeDirection'; obj: NodeObj }
    | { name: 'collapseAllBranches'; obj: NodeObj }
    | { name: 'editArrowLabel'; obj: MindElixirArrow }
    | { name: 'expandAllBranches'; obj: NodeObj }
    | { name: 'import'; obj: NodeObj }
    | { name: 'outline_structure_change'; obj: NodeObj }
    | { name: 'template_apply'; obj: NodeObj };

export type VizlyMindMapData = Omit<MindElixirData, 'direction'> & {
    direction?: number;
};

type OperationEmitter = (
    this: MindElixirInstance['bus'],
    event: 'operation',
    operation: VizlyMindMapOperation,
) => void;

export const emitVizlyMindMapOperation = (
    mind: Pick<MindElixirInstance, 'bus'>,
    operation: VizlyMindMapOperation,
): void => {
    // mind-elixir's public operation union cannot be extended, although its
    // runtime pubsub accepts application operations. Keep that cast here.
    const emit = mind.bus.fire as unknown as OperationEmitter;
    emit.call(mind.bus, 'operation', operation);
};

export const refreshVizlyMindMapData = (
    mind: MindElixirInstance,
    data: VizlyMindMapData,
): void => {
    // The runtime accepts direction 3 and existing persisted Vizly maps use it,
    // while the upstream declaration currently narrows direction to 0 | 1 | 2.
    mind.refresh(data as MindElixirData);
};
