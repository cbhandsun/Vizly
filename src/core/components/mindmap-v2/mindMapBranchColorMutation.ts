import type { NodeObj, Topic } from 'mind-elixir';

import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { cleanMindMapColor } from './mindmapTreeSanitizer';

interface BranchColorMutationMindMap {
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
    mind: BranchColorMutationMindMap,
    node: NodeObj,
): boolean {
    const refreshedTopic = mind.findEle(node.id);
    if (!refreshedTopic) return false;
    mind.selectNodes([refreshedTopic]);
    mind.bus.fire('selectNodes', [node]);
    return true;
}

export async function updateMindMapBranchColorAndRestoreSelection(
    mind: BranchColorMutationMindMap,
    topic: Topic,
    node: NodeObj,
    color: unknown,
): Promise<boolean> {
    const patch = cleanMindMapNodePatch({ branchColor: cleanMindMapColor(color) });
    const nextNode = { ...node, ...patch } as NodeObj;
    await mind.reshapeNode(topic, nextNode);

    let restored = false;
    for (let renderFrame = 0; renderFrame < 3; renderFrame += 1) {
        await waitForMindMapRenderFrame();
        restored = restoreMindMapTopicSelection(mind, nextNode);
    }
    return restored;
}
