import type { NodeObj, Topic } from 'mind-elixir';

import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';

export interface MindMapNodeMutationResult {
    nextNode: NodeObj;
    restored: boolean;
}

interface MindMapNodeMutationTarget {
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

export async function updateMindMapNodePatchAndRestoreSelection(
    mind: MindMapNodeMutationTarget,
    topic: Topic,
    node: NodeObj,
    patch: Partial<NodeObj> & Record<string, unknown>,
): Promise<MindMapNodeMutationResult> {
    const nextNode = { ...node, ...cleanMindMapNodePatch(patch) } as NodeObj;
    await mind.reshapeNode(topic, nextNode);

    let restored = false;
    for (let renderFrame = 0; renderFrame < 3; renderFrame += 1) {
        await waitForMindMapRenderFrame();
        const refreshedTopic = mind.findEle(nextNode.id);
        if (!refreshedTopic) continue;
        mind.selectNodes([refreshedTopic]);
        mind.bus.fire('selectNodes', [nextNode]);
        restored = true;
    }

    return { nextNode, restored };
}
