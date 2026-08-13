import type { MindElixirInstance, NodeObj } from 'mind-elixir';

type EmptyStateMindMap = Pick<MindElixirInstance, 'bus' | 'container' | 'getData'>;
type MindMapTreeReader = { getData: () => { nodeData: Pick<NodeObj, 'children'> } };

interface EmptyStateObserver {
    disconnect: () => void;
    observe: (target: Node, options: MutationObserverInit) => void;
}

export interface MindMapEmptyStateDependencies {
    createObserver: (callback: () => void) => EmptyStateObserver;
    schedule: (callback: () => void) => void;
}

const DEFAULT_DEPENDENCIES: MindMapEmptyStateDependencies = {
    createObserver: callback => new MutationObserver(callback),
    schedule: callback => queueMicrotask(callback),
};

export const readMindMapEmptyState = (mind: MindMapTreeReader): boolean => {
    const children = mind.getData().nodeData.children;
    return !Array.isArray(children) || children.length === 0;
};

export const bindMindMapEmptyState = ({
    mind,
    onChange,
    onFailure,
    dependencies: overrides = {},
}: {
    mind: EmptyStateMindMap;
    onChange: (isEmpty: boolean) => void;
    onFailure: (error: unknown) => void;
    dependencies?: Partial<MindMapEmptyStateDependencies>;
}): (() => void) => {
    const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
    let cancelled = false;
    let scheduled = false;

    const check = () => {
        scheduled = false;
        if (cancelled) return;
        try {
            onChange(readMindMapEmptyState(mind));
        } catch (error) {
            onFailure(error);
        }
    };
    const scheduleCheck = () => {
        if (cancelled || scheduled) return;
        scheduled = true;
        dependencies.schedule(check);
    };

    mind.bus.addListener('operation', scheduleCheck);
    const observer = dependencies.createObserver(scheduleCheck);
    observer.observe(mind.container, { childList: true, subtree: true });
    scheduleCheck();

    return () => {
        cancelled = true;
        mind.bus.removeListener('operation', scheduleCheck);
        observer.disconnect();
    };
};
