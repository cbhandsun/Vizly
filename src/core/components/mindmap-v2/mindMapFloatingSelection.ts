import type { NodeObj, Topic } from 'mind-elixir';

import { findNodeById } from './migrate';

interface MindMapSelectionSource {
    readonly currentNode: Topic | null;
    readonly container: Pick<ParentNode, 'contains' | 'querySelector'>;
    findEle: (nodeId: string) => Topic | null;
}

const isTopicOwnedByMindMap = (
    mind: MindMapSelectionSource,
    topic: Topic | null,
): topic is Topic => Boolean(
    topic
    && topic.isConnected
    && mind.container.contains(topic),
);

export function resolveMindMapTopicById(
    mind: MindMapSelectionSource,
    nodeId: string,
): Topic | null {
    try {
        const topic = mind.findEle(nodeId);
        return isTopicOwnedByMindMap(mind, topic) ? topic : null;
    } catch {
        return null;
    }
}

export function resolveSelectedMindMapTopic(
    mind: MindMapSelectionSource,
    fallbackNodeId: string | null,
): Topic | null {
    if (isTopicOwnedByMindMap(mind, mind.currentNode)) return mind.currentNode;
    if (fallbackNodeId) {
        const fallback = resolveMindMapTopicById(mind, fallbackNodeId);
        if (fallback?.classList.contains('selected')) return fallback;
    }
    try {
        const selectedTopic = mind.container.querySelector<Topic>('me-tpc.selected');
        return isTopicOwnedByMindMap(mind, selectedTopic) ? selectedTopic : null;
    } catch {
        return null;
    }
}

interface RestorableMindMapSelection extends MindMapSelectionSource {
    bus: {
        fire: (event: 'selectNodes', nodes: NodeObj[]) => void;
    };
    getData: () => { nodeData: NodeObj };
    selectNodes: (topics: Topic[]) => void;
}

async function waitForSelectionRenderFrame(): Promise<void> {
    if (typeof requestAnimationFrame !== 'function') return;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

export async function resolveMindMapNodeAfterSelectionSettles(
    mind: RestorableMindMapSelection,
    fallbackNodeId: string | null = null,
): Promise<NodeObj | null> {
    let resolvedNode: NodeObj | null = null;
    for (let renderFrame = 0; renderFrame < 3; renderFrame += 1) {
        await waitForSelectionRenderFrame();
        const topic = resolveSelectedMindMapTopic(mind, fallbackNodeId);
        const nodeId = topic?.dataset?.nodeid ?? '';
        if (!nodeId) continue;
        try {
            resolvedNode = findNodeById(mind.getData().nodeData, nodeId) ?? resolvedNode;
        } catch {
            // Keep waiting: Mind Elixir can replace its data tree and selected
            // topic in different render frames during copy/reshape operations.
        }
    }
    return resolvedNode;
}

export async function restoreCurrentMindMapSelectionAfterMutation(
    mind: RestorableMindMapSelection,
    fallbackNodeId: string | null = null,
): Promise<NodeObj | null> {
    let restoredNode: NodeObj | null = null;
    for (let renderFrame = 0; renderFrame < 3; renderFrame += 1) {
        await waitForSelectionRenderFrame();
        const topic = resolveSelectedMindMapTopic(mind, fallbackNodeId);
        const nodeId = topic?.dataset?.nodeid ?? '';
        if (!topic || !nodeId) continue;
        const node = findNodeById(mind.getData().nodeData, nodeId);
        if (!node) continue;
        mind.selectNodes([topic]);
        mind.bus.fire('selectNodes', [node]);
        restoredNode = node;
    }
    return restoredNode;
}
