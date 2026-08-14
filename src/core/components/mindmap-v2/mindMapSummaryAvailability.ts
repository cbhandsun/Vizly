import type { MindElixirData, NodeObj } from 'mind-elixir';

export type MindMapSummaryAvailability =
    | { enabled: true }
    | {
        enabled: false;
        reason: 'no-instance' | 'no-selection' | 'root-selected' | 'invalid-root';
    };

interface MindMapSummaryAvailabilityHost {
    getData: () => MindElixirData;
}

export function getMindMapSummaryAvailability(
    mind: MindMapSummaryAvailabilityHost | null,
    selectedNode: Pick<NodeObj, 'id'> | null,
): MindMapSummaryAvailability {
    if (!mind) return { enabled: false, reason: 'no-instance' };

    const selectedNodeId = selectedNode?.id?.trim();
    if (!selectedNodeId) return { enabled: false, reason: 'no-selection' };

    try {
        const rootNodeId = mind.getData()?.nodeData?.id;
        if (typeof rootNodeId !== 'string' || !rootNodeId.trim()) {
            return { enabled: false, reason: 'invalid-root' };
        }
        if (selectedNodeId === rootNodeId.trim()) {
            return { enabled: false, reason: 'root-selected' };
        }
    } catch {
        return { enabled: false, reason: 'invalid-root' };
    }

    return { enabled: true };
}
