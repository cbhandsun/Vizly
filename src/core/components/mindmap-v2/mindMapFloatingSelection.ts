import type { NodeObj, Topic } from 'mind-elixir';

import { findNodeById } from './migrate';

interface MindMapSelectionSource {
    readonly currentNode: Topic | null;
    readonly container: Pick<ParentNode, 'querySelector'>;
    findEle: (nodeId: string) => Topic | null;
}

export function resolveSelectedMindMapTopic(
    mind: MindMapSelectionSource,
    fallbackNodeId: string | null,
): Topic | null {
    if (mind.currentNode) return mind.currentNode;
    if (fallbackNodeId) {
        try {
            const fallback = mind.findEle(fallbackNodeId);
            if (fallback?.classList.contains('selected')) return fallback;
        } catch {
            // The refreshed topic can briefly be unavailable by id. Fall
            // through to the instance-scoped DOM selection below.
        }
    }
    try {
        return mind.container.querySelector<Topic>('me-tpc.selected');
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
