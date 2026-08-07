import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { findNodeById } from './migrate';
import { resolveSelectedMindMapTopic } from './mindMapFloatingSelection';

export function resolveSelectedMindMapNode(
    mind: MindElixirInstance,
    fallbackNodeId: string | null = null,
): NodeObj | null {
    const topic = resolveSelectedMindMapTopic(mind, fallbackNodeId);
    const nodeId = topic?.dataset?.nodeid ?? '';
    if (!nodeId) return null;
    try {
        return findNodeById(mind.getData().nodeData, nodeId);
    } catch {
        return null;
    }
}
