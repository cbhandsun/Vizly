import { describe, expect, it, vi } from 'vitest';
import { createEdgeLabelArrangementStore, getEdgeLabelArrangementStore } from '../edgeLabelArrangementStore';
import type { EdgeLabelArrangementInput } from '../edgeLabelArrangement';

const input = (id: string, y = 0): EdgeLabelArrangementInput => ({
  id, path: [{ x: 0, y }, { x: 300, y }], labelPath: [{ x: 0, y }, { x: 300, y }],
  anchor: { x: 150, y }, preferredCenter: { x: 150, y: y + 30 }, text: '条件',
  scale: 1, manual: false, obstacles: [],
});
const flush = () => new Promise<void>(resolve => queueMicrotask(resolve));

describe('edge label arrangement store', () => {
  it('batches registrations and retains equal snapshots without publication loops', async () => {
    const store = createEdgeLabelArrangementStore();
    const listener = vi.fn();
    const owner = Symbol();
    store.subscribe(listener);
    store.put(owner, 'a1', input('a'));
    store.put(owner, 'b1', input('b'));
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = store.get('a');
    store.put(owner, 'a1', input('a'));
    await flush();
    expect(store.get('a')).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('isolates identical edge IDs across canvases and releases unmounted geometry', async () => {
    const a = getEdgeLabelArrangementStore({});
    const b = getEdgeLabelArrangementStore({});
    const owner = Symbol();
    a.put(owner, 'one', input('same'));
    b.put(owner, 'two', input('same', 100));
    await flush();
    expect(a.get('same')?.placement.center).not.toEqual(b.get('same')?.placement.center);
    a.remove(owner, 'same');
    await flush();
    expect(a.get('same')).toBeUndefined();
    expect(b.get('same')).toBeDefined();
  });

  it('protects a new same-ID generation from an older cleanup', async () => {
    const store = createEdgeLabelArrangementStore();
    const oldOwner = Symbol();
    const newOwner = Symbol();
    store.put(oldOwner, 'old', input('a'));
    store.put(newOwner, 'new', input('a', 200));
    store.remove(oldOwner, 'a');
    await flush();
    expect(store.get('a')?.key).toBe('new');
    expect(store.get('a')?.placement.anchor.y).toBe(200);
  });

  it('uses only the latest path and size after rapid updates and stops unsubscribed callbacks', async () => {
    const store = createEdgeLabelArrangementStore();
    const owner = Symbol();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.put(owner, 'old', input('a'));
    store.put(owner, 'new', { ...input('a', 200), size: { width: 220, height: 130 } });
    await flush();
    expect(store.get('a')?.key).toBe('new');
    expect(store.get('a')?.placement.rect.height).toBe(130);
    unsubscribe();
    store.remove(owner, 'a');
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
