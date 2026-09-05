import { arrangeEdgeLabels, type EdgeLabelArrangementInput, type EdgeLabelPlacement } from './edgeLabelArrangement';

type Entry = { owner: symbol; key: string; input: EdgeLabelArrangementInput };
type Snapshot = { key: string; placement: EdgeLabelPlacement };

export const createEdgeLabelArrangementStore = () => {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let snapshots = new Map<string, Snapshot>();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const placements = arrangeEdgeLabels([...entries.values()].map(entry => entry.input));
      const next = new Map<string, Snapshot>();
      for (const [id, placement] of placements) {
        const entry = entries.get(id);
        if (!entry) continue;
        const previous = snapshots.get(id);
        next.set(id, previous?.key === entry.key && JSON.stringify(previous.placement) === JSON.stringify(placement)
          ? previous : { key: entry.key, placement });
      }
      const changed = next.size !== snapshots.size || [...next].some(([id, value]) => snapshots.get(id) !== value);
      snapshots = next;
      if (changed) for (const listener of listeners) listener();
    });
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get: (id: string): Snapshot | undefined => snapshots.get(id),
    put: (owner: symbol, key: string, input: EdgeLabelArrangementInput) => {
      const previous = entries.get(input.id);
      if (previous?.owner === owner && previous.key === key) return;
      entries.set(input.id, { owner, key, input });
      schedule();
    },
    remove: (owner: symbol, id: string) => {
      if (entries.get(id)?.owner !== owner) return;
      entries.delete(id);
      schedule();
    },
  };
};

const canvasStores = new WeakMap<object, ReturnType<typeof createEdgeLabelArrangementStore>>();
export const getEdgeLabelArrangementStore = (canvas: object) => {
  let store = canvasStores.get(canvas);
  if (!store) { store = createEdgeLabelArrangementStore(); canvasStores.set(canvas, store); }
  return store;
};
