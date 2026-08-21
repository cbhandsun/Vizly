import i18n from 'i18next';
import type { MindElixirData, MindElixirInstance, NodeObj, Topic } from 'mind-elixir';

export const MINDMAP_GENERATED_TOPIC_FIELD = 'vizlyGeneratedTopicKey' as const;

export const MINDMAP_GENERATED_TOPIC_KEYS = {
    newNode: 'plugins.mindmap.newNode',
    untitled: 'plugins.mindmap.untitledNode',
} as const;

export type MindMapGeneratedTopicKey = (
    typeof MINDMAP_GENERATED_TOPIC_KEYS[keyof typeof MINDMAP_GENERATED_TOPIC_KEYS]
);

export type MindMapNodeWithGeneratedTopic = NodeObj & {
    [MINDMAP_GENERATED_TOPIC_FIELD]?: MindMapGeneratedTopicKey;
};

const GENERATED_TOPIC_KEYS = new Set<string>(Object.values(MINDMAP_GENERATED_TOPIC_KEYS));
const GENERATED_TOPIC_FALLBACKS: Record<MindMapGeneratedTopicKey, string> = {
    [MINDMAP_GENERATED_TOPIC_KEYS.newNode]: 'New node',
    [MINDMAP_GENERATED_TOPIC_KEYS.untitled]: 'Untitled node',
};

export const coerceMindMapGeneratedTopicKey = (
    value: unknown,
): MindMapGeneratedTopicKey | undefined => (
    typeof value === 'string' && GENERATED_TOPIC_KEYS.has(value)
        ? value as MindMapGeneratedTopicKey
        : undefined
);

export const resolveMindMapGeneratedTopic = (
    key: MindMapGeneratedTopicKey,
): string => {
    const translated = i18n.isInitialized ? i18n.t(key) : '';
    const localized = typeof translated === 'string' ? translated.trim() : '';
    return localized && localized !== key
        ? localized
        : GENERATED_TOPIC_FALLBACKS[key];
};

export const markMindMapTopicAsGenerated = (
    node: NodeObj,
    key: MindMapGeneratedTopicKey,
): MindMapNodeWithGeneratedTopic => {
    const generatedNode = node as MindMapNodeWithGeneratedTopic;
    generatedNode[MINDMAP_GENERATED_TOPIC_FIELD] = key;
    return generatedNode;
};

export const clearMindMapGeneratedTopicMarker = (node: NodeObj | null | undefined): void => {
    if (!node) return;
    delete (node as MindMapNodeWithGeneratedTopic)[MINDMAP_GENERATED_TOPIC_FIELD];
};

export const assignMindMapAuthoredTopic = (node: NodeObj, topic: string): void => {
    clearMindMapGeneratedTopicMarker(node);
    node.topic = topic;
};

export interface MindMapTopicEditor {
    setNodeTopic: (
        ...args: Parameters<MindElixirInstance['setNodeTopic']>
    ) => ReturnType<MindElixirInstance['setNodeTopic']>;
}

export const bindMindMapGeneratedTopicAuthorship = (
    mind: MindMapTopicEditor,
): (() => void) => {
    const originalSetNodeTopic = mind.setNodeTopic;
    mind.setNodeTopic = (...args: Parameters<MindElixirInstance['setNodeTopic']>) => {
        clearMindMapGeneratedTopicMarker(args[0]?.nodeObj);
        return originalSetNodeTopic.call(mind, ...args);
    };
    return () => {
        mind.setNodeTopic = originalSetNodeTopic;
    };
};

export interface RelocalizedMindMapTree {
    nodeData: NodeObj;
    changed: boolean;
}

export const relocalizeGeneratedMindMapTopics = (node: NodeObj): RelocalizedMindMapTree => {
    const generatedNode = node as MindMapNodeWithGeneratedTopic;
    const key = coerceMindMapGeneratedTopicKey(generatedNode[MINDMAP_GENERATED_TOPIC_FIELD]);
    const localizedTopic = key ? resolveMindMapGeneratedTopic(key) : '';
    const nextChildren: NodeObj[] = [];
    let childrenChanged = false;

    for (const child of node.children ?? []) {
        const localizedChild = relocalizeGeneratedMindMapTopics(child);
        nextChildren.push(localizedChild.nodeData);
        childrenChanged ||= localizedChild.changed;
    }

    const topicChanged = Boolean(localizedTopic && localizedTopic !== node.topic);
    if (!topicChanged && !childrenChanged) {
        return { nodeData: node, changed: false };
    }

    return {
        nodeData: {
            ...node,
            ...(topicChanged ? { topic: localizedTopic } : {}),
            children: childrenChanged ? nextChildren : node.children,
        },
        changed: true,
    };
};

export interface MindMapGeneratedTopicLocaleRuntime {
    data: MindElixirData;
    selectedNodeIds: readonly string[];
    refresh: (data: MindElixirData) => void;
    findTopic: (nodeId: string) => Topic | null;
    selectTopics: (topics: Topic[]) => void;
}

export const applyGeneratedTopicLocaleToMindMap = ({
    data,
    selectedNodeIds,
    refresh,
    findTopic,
    selectTopics,
}: MindMapGeneratedTopicLocaleRuntime): boolean => {
    const localized = relocalizeGeneratedMindMapTopics(data.nodeData);
    if (!localized.changed) return false;

    refresh({ ...data, nodeData: localized.nodeData });
    const topics = selectedNodeIds
        .map(findTopic)
        .filter((topic): topic is Topic => topic !== null);
    if (topics.length > 0) selectTopics(topics);
    return true;
};
