import { beforeEach, describe, expect, it, vi } from 'vitest';

const importStore = async () => {
    vi.resetModules();
    return import('../mindmapOutlineStore');
};

describe('mindmapOutlineStore', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('keeps explicit close and keyboard toggle state synchronized', async () => {
        const {
            emitToggleOutline,
            getOutlineOpen,
            setOutlineOpen,
            subscribeOutline,
        } = await importStore();
        const states: boolean[] = [];
        const unsubscribe = subscribeOutline(open => states.push(open));

        expect(states).toEqual([false]);
        setOutlineOpen(true);
        setOutlineOpen(false);
        emitToggleOutline();

        expect(states).toEqual([false, true, false, true]);
        expect(getOutlineOpen()).toBe(true);
        unsubscribe();
    });
});
