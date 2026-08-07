import type { NodeObj, Topic } from 'mind-elixir';

import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';

interface NoteMutationMindMap {
    bus: {
        fire: (event: 'selectNodes', nodes: NodeObj[]) => void;
    };
    findEle: (nodeId: string) => Topic | null;
    reshapeNode: (topic: Topic, node: NodeObj) => Promise<void> | void;
    selectNodes: (topics: Topic[]) => void;
}

async function waitForMindMapRenderFrame(): Promise<void> {
    if (typeof requestAnimationFrame !== 'function') return;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function restoreMindMapTopicSelection(
    mind: NoteMutationMindMap,
    node: NodeObj,
): boolean {
    const refreshedTopic = mind.findEle(node.id);
    if (!refreshedTopic) return false;
    mind.selectNodes([refreshedTopic]);
    mind.bus.fire('selectNodes', [node]);
    return true;
}

export async function updateMindMapNoteAndRestoreSelection(
    mind: NoteMutationMindMap,
    topic: Topic,
    node: NodeObj,
    note: string | undefined,
): Promise<boolean> {
    const patch = cleanMindMapNodePatch({ note });
    await mind.reshapeNode(topic, { ...node, ...patch } as NodeObj);

    await waitForMindMapRenderFrame();
    if (!restoreMindMapTopicSelection(mind, node)) return false;

    // reshapeNode can complete before Mind Elixir finishes replacing the
    // topic element. Reconcile once more on the next render frame so a late
    // empty-selection event cannot dismiss the floating toolbar.
    await waitForMindMapRenderFrame();
    return restoreMindMapTopicSelection(mind, node);
}
