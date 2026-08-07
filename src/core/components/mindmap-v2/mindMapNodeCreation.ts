import type { NodeObj, Topic } from 'mind-elixir';

import { cleanMindMapChildNode } from './mindmapBridgeSecurity';

interface EditableChildMindMap {
    addChild: (parent: Topic, child: NodeObj) => Promise<void>;
    findEle: (nodeId: string) => Topic | null;
    selectNode: (topic: Topic) => void;
    scrollIntoView: (topic: Topic, forceCenter?: boolean) => void;
    editTopic: (topic: Topic) => void;
}

export async function addEditableMindMapChild(
    mind: EditableChildMindMap,
    parent: Topic,
): Promise<string | null> {
    const child = cleanMindMapChildNode();
    await mind.addChild(parent, child);

    const childTopic = mind.findEle(child.id);
    if (!childTopic) return null;

    mind.selectNode(childTopic);
    mind.scrollIntoView(childTopic, true);
    mind.editTopic(childTopic);
    return child.id;
}
