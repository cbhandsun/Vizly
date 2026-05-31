import { describe, expect, it } from 'vitest';
import type { MindElixirInstance } from 'mind-elixir';
import {
    getMindElixirInstance,
    registerMindElixirInstance,
    subscribeMindElixir,
    unregisterMindElixirInstance,
} from '../mindElixirStore';

describe('mindElixirStore', () => {
    it('notifies subscribers with the active instance and null on cleanup', () => {
        const instance = { id: 'mind' } as unknown as MindElixirInstance;
        const seen: Array<MindElixirInstance | null> = [];

        const unsubscribe = subscribeMindElixir(next => seen.push(next));

        registerMindElixirInstance(instance);
        expect(getMindElixirInstance()).toBe(instance);
        expect(seen).toEqual([instance]);

        unregisterMindElixirInstance();
        expect(getMindElixirInstance()).toBeNull();
        expect(seen).toEqual([instance, null]);

        unsubscribe();
    });

    it('stops notifying after unsubscribe', () => {
        const instance = { id: 'first' } as unknown as MindElixirInstance;
        const nextInstance = { id: 'second' } as unknown as MindElixirInstance;
        const seen: Array<MindElixirInstance | null> = [];

        const unsubscribe = subscribeMindElixir(next => seen.push(next));
        registerMindElixirInstance(instance);
        unsubscribe();
        registerMindElixirInstance(nextInstance);

        expect(seen).toEqual([instance]);
    });
});
