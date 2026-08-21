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

interface MindMapNodeMutationQueue {
    committedNode: NodeObj;
    tail: Promise<void>;
}

const mutationQueues = new WeakMap<
    MindMapNodeMutationTarget,
    Map<string, MindMapNodeMutationQueue>
>();

async function waitForMindMapRenderFrame(): Promise<void> {
    if (typeof requestAnimationFrame !== 'function') return;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function mergeCleanMindMapNodePatch(
    baseNode: NodeObj,
    cleanPatch: Partial<NodeObj> & Record<string, unknown>,
): NodeObj {
    const nextNode = { ...baseNode, ...cleanPatch } as NodeObj;
    if (cleanPatch.style && typeof cleanPatch.style === 'object') {
        nextNode.style = {
            ...(baseNode.style ?? {}),
            ...cleanPatch.style,
        };
    }
    return nextNode;
}

export async function updateMindMapNodePatchAndRestoreSelection(
    mind: MindMapNodeMutationTarget,
    topic: Topic,
    node: NodeObj,
    patch: Partial<NodeObj> & Record<string, unknown>,
): Promise<MindMapNodeMutationResult> {
    let queues = mutationQueues.get(mind);
    if (!queues) {
        queues = new Map();
        mutationQueues.set(mind, queues);
    }
    let queue = queues.get(node.id);
    if (!queue) {
        queue = { committedNode: node, tail: Promise.resolve() };
        queues.set(node.id, queue);
    }

    const cleanPatch = cleanMindMapNodePatch(patch);
    const operation = queue.tail.then(async (): Promise<MindMapNodeMutationResult> => {
        const baseNode = queue?.committedNode ?? node;
        const nextNode = mergeCleanMindMapNodePatch(baseNode, cleanPatch);
        await mind.reshapeNode(topic, nextNode);
        if (queue) queue.committedNode = nextNode;

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
    });
    const settledTail = operation.then(() => undefined, () => undefined);
    queue.tail = settledTail;
    void settledTail.then(() => {
        if (queue?.tail !== settledTail) return;
        queues?.delete(node.id);
        if (queues?.size === 0) mutationQueues.delete(mind);
    });
    return operation;
}
