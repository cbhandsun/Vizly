import type { MindElixirInstance } from 'mind-elixir';

export interface MindMapHistoryAvailability {
    canRedo: boolean;
    canUndo: boolean;
}

interface MutableHistoryMethods {
    clearHistory?: () => void;
    redo: () => void;
    undo: () => void;
}

type HistoryAvailabilityListener = () => void;
type OperationListener = (operation: unknown) => void;
type OperationSubscription = (listener: OperationListener) => () => void;

export interface MindMapHistoryAvailabilityController {
    dispose: () => void;
    getSnapshot: () => MindMapHistoryAvailability;
    subscribe: (listener: HistoryAvailabilityListener) => () => void;
}

export const EMPTY_MIND_MAP_HISTORY_AVAILABILITY: MindMapHistoryAvailability = Object.freeze({
    canRedo: false,
    canUndo: false,
});

const controllers = new WeakMap<MindElixirInstance, MindMapHistoryAvailabilityController>();

const readOperationName = (operation: unknown): string | null => {
    if (typeof operation !== 'object' || operation === null || Array.isArray(operation)) return null;
    const name = Reflect.get(operation, 'name');
    return typeof name === 'string' && name.length > 0 ? name : null;
};

export const createMindMapHistoryAvailabilityController = (
    target: MutableHistoryMethods,
    subscribeToOperations: OperationSubscription,
): MindMapHistoryAvailabilityController => {
    const listeners = new Set<HistoryAvailabilityListener>();
    const originalUndo = target.undo;
    const originalRedo = target.redo;
    const originalClearHistory = target.clearHistory;
    let cursor = -1;
    let historyLength = 0;
    let disposed = false;
    let snapshot = EMPTY_MIND_MAP_HISTORY_AVAILABILITY;

    const publish = (): void => {
        const nextSnapshot = {
            canRedo: cursor < historyLength - 1,
            canUndo: cursor >= 0,
        };
        if (
            nextSnapshot.canRedo === snapshot.canRedo
            && nextSnapshot.canUndo === snapshot.canUndo
        ) return;
        snapshot = nextSnapshot;
        listeners.forEach(listener => listener());
    };

    const wrappedUndo = (): void => {
        originalUndo.call(target);
        if (cursor < 0) return;
        cursor -= 1;
        publish();
    };

    const wrappedRedo = (): void => {
        originalRedo.call(target);
        if (cursor >= historyLength - 1) return;
        cursor += 1;
        publish();
    };

    const wrappedClearHistory = (): void => {
        originalClearHistory?.call(target);
        cursor = -1;
        historyLength = 0;
        publish();
    };

    const handleOperation = (operation: unknown): void => {
        const operationName = readOperationName(operation);
        if (!operationName || operationName === 'beginEdit') return;
        historyLength = cursor + 2;
        cursor = historyLength - 1;
        publish();
    };

    target.undo = wrappedUndo;
    target.redo = wrappedRedo;
    if (originalClearHistory) target.clearHistory = wrappedClearHistory;
    const unsubscribeFromOperations = subscribeToOperations(handleOperation);

    return {
        dispose: () => {
            if (disposed) return;
            disposed = true;
            unsubscribeFromOperations();
            listeners.clear();
            if (target.undo === wrappedUndo) target.undo = originalUndo;
            if (target.redo === wrappedRedo) target.redo = originalRedo;
            if (originalClearHistory && target.clearHistory === wrappedClearHistory) {
                target.clearHistory = originalClearHistory;
            }
        },
        getSnapshot: () => snapshot,
        subscribe: listener => {
            if (disposed) return () => undefined;
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
};

export const trackMindMapHistoryAvailability = (mind: MindElixirInstance): (() => void) => {
    const existing = controllers.get(mind);
    if (existing) return () => undefined;

    const controller = createMindMapHistoryAvailabilityController(
        mind,
        listener => {
            const handleOperation = (operation: unknown): void => listener(operation);
            mind.bus.addListener('operation', handleOperation);
            return () => mind.bus.removeListener('operation', handleOperation);
        },
    );
    controllers.set(mind, controller);

    return () => {
        if (controllers.get(mind) !== controller) return;
        controllers.delete(mind);
        controller.dispose();
    };
};

export const getMindMapHistoryAvailability = (
    mind: MindElixirInstance | null,
): MindMapHistoryAvailability => (
    mind ? controllers.get(mind)?.getSnapshot() ?? EMPTY_MIND_MAP_HISTORY_AVAILABILITY
        : EMPTY_MIND_MAP_HISTORY_AVAILABILITY
);

export const subscribeMindMapHistoryAvailability = (
    mind: MindElixirInstance | null,
    listener: HistoryAvailabilityListener,
): (() => void) => (
    mind ? controllers.get(mind)?.subscribe(listener) ?? (() => undefined) : () => undefined
);
