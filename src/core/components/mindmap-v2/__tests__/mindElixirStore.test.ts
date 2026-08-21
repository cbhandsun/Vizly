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
        expect(seen).toEqual([null, instance]);

        unregisterMindElixirInstance(instance);
        expect(getMindElixirInstance()).toBeNull();
        expect(seen).toEqual([null, instance, null]);

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

        expect(seen).toEqual([null, instance]);
        unregisterMindElixirInstance(nextInstance);
    });

    it('immediately supplies the current instance to late subscribers', () => {
        const instance = { id: 'current' } as unknown as MindElixirInstance;
        const seen: Array<MindElixirInstance | null> = [];

        registerMindElixirInstance(instance);
        const unsubscribe = subscribeMindElixir(next => seen.push(next));

        expect(seen).toEqual([instance]);
        unsubscribe();
        unregisterMindElixirInstance(instance);
    });

    it('does not let stale cleanup unregister a replacement instance', () => {
        const staleInstance = { id: 'stale' } as unknown as MindElixirInstance;
        const replacement = { id: 'replacement' } as unknown as MindElixirInstance;
        const seen: Array<MindElixirInstance | null> = [];

        registerMindElixirInstance(staleInstance);
        const unsubscribe = subscribeMindElixir(next => seen.push(next));
        registerMindElixirInstance(replacement);
        unregisterMindElixirInstance(staleInstance);

        expect(getMindElixirInstance()).toBe(replacement);
        expect(seen).toEqual([staleInstance, replacement]);

        unregisterMindElixirInstance(replacement);
        expect(seen).toEqual([staleInstance, replacement, null]);
        unsubscribe();
    });
});
