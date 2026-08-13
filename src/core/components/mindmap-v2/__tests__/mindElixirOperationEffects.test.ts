import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';
import i18n from '@/i18n';

import { bindMindElixirOperationEffects } from '../mindElixirOperationEffects';

describe('mind elixir operation effects', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('removes the exact listeners and cancels every pending task during cleanup', () => {
        const listeners: Array<(operation?: unknown) => void> = [];
        const addListener = vi.fn((_event: string, listener: (operation?: unknown) => void) => {
            listeners.push(listener);
        });
        const removeListener = vi.fn();
        const nodeData = { id: 'root', topic: 'Root', children: [] } as NodeObj;
        const mind = {
            bus: { addListener, removeListener },
            getData: () => ({ nodeData }),
            findEle: vi.fn(() => null),
        } as unknown as MindElixirInstance;
        const root = { querySelectorAll: vi.fn(() => []) } as unknown as ParentNode;
        const pending = new Map<number, () => void>();
        let nextTimer = 1;
        const schedule = vi.fn((callback: () => void) => {
            const handle = nextTimer++;
            pending.set(handle, callback);
            return handle as unknown as ReturnType<typeof setTimeout>;
        });
        const clearSchedule = vi.fn((handle: ReturnType<typeof setTimeout>) => {
            pending.delete(handle as unknown as number);
        });
        const recordHistory = vi.fn();
        const onSave = vi.fn();

        const cleanup = bindMindElixirOperationEffects({
            mind,
            root,
            onSave,
            dependencies: {
                schedule,
                clearSchedule,
                recordHistory,
            },
        });
        expect(addListener).toHaveBeenCalledTimes(3);

        listeners[0]?.({ name: 'addChild' });
        expect(recordHistory).toHaveBeenCalledWith('Child node added', nodeData);
        expect(pending.size).toBe(3);

        cleanup();

        expect(removeListener.mock.calls).toEqual(addListener.mock.calls);
        expect(clearSchedule).toHaveBeenCalledTimes(3);
        expect(pending.size).toBe(0);
        expect(onSave).not.toHaveBeenCalled();
    });

    it('debounces repeated saves and uses a safe fallback operation description', () => {
        const listeners: Array<(operation?: unknown) => void> = [];
        const mind = {
            bus: {
                addListener: (_event: string, listener: (operation?: unknown) => void) => listeners.push(listener),
                removeListener: vi.fn(),
            },
            getData: () => ({ nodeData: { id: 'root', topic: 'Root', children: [] } as NodeObj }),
            findEle: vi.fn(() => null),
        } as unknown as MindElixirInstance;
        const pending = new Map<number, () => void>();
        let nextTimer = 1;
        const schedule = (callback: () => void) => {
            const handle = nextTimer++;
            pending.set(handle, callback);
            return handle as unknown as ReturnType<typeof setTimeout>;
        };
        const clearSchedule = (handle: ReturnType<typeof setTimeout>) => {
            pending.delete(handle as unknown as number);
        };
        const recordHistory = vi.fn();
        const onSave = vi.fn();
        const cleanup = bindMindElixirOperationEffects({
            mind,
            root: { querySelectorAll: () => [] } as unknown as ParentNode,
            onSave,
            dependencies: { schedule, clearSchedule, recordHistory },
        });

        listeners[0]?.({ name: 'unknown-operation' });
        listeners[0]?.({ name: 'unknown-operation' });
        expect(recordHistory).toHaveBeenCalledTimes(2);
        expect(recordHistory).toHaveBeenLastCalledWith('Mind map updated', expect.anything());
        listeners[0]?.({ name: 'changeDirection' });
        expect(recordHistory).toHaveBeenLastCalledWith('Mind map updated', expect.anything());
        expect(pending.size).toBe(3);

        const saveTask = [...pending.entries()].find(([handle]) => handle > 2);
        expect(saveTask).toBeDefined();
        saveTask?.[1]();
        expect(onSave).toHaveBeenCalledTimes(1);
        cleanup();
    });
});
