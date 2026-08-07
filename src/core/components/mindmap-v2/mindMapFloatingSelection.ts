import type { Topic } from 'mind-elixir';

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
