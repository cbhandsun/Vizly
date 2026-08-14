import { describe, expect, it } from 'vitest';

import { getMindMapFocusAvailability } from '../mindMapFocusAvailability';

const createMind = (rootId: string = 'root') => ({
    getData: () => ({ nodeData: { id: rootId } }),
});

describe('getMindMapFocusAvailability', () => {
    it('enables focus mode only for a selected non-root node', () => {
        expect(getMindMapFocusAvailability(createMind(), { id: 'child' })).toEqual({ enabled: true });
        expect(getMindMapFocusAvailability(createMind(), { id: ' root ' })).toEqual({
            enabled: false,
            reason: 'root-selected',
        });
    });

    it('rejects missing instances and empty selections', () => {
        expect(getMindMapFocusAvailability(null, { id: 'child' })).toEqual({
            enabled: false,
            reason: 'no-instance',
        });
        expect(getMindMapFocusAvailability(createMind(), null)).toEqual({
            enabled: false,
            reason: 'no-selection',
        });
        expect(getMindMapFocusAvailability(createMind(), { id: '   ' })).toEqual({
            enabled: false,
            reason: 'no-selection',
        });
    });

    it('fails closed when root data is invalid or unavailable', () => {
        expect(getMindMapFocusAvailability(createMind('   '), { id: 'child' })).toEqual({
            enabled: false,
            reason: 'invalid-root',
        });
        expect(getMindMapFocusAvailability({
            getData: () => { throw new Error('unavailable'); },
        }, { id: 'child' })).toEqual({
            enabled: false,
            reason: 'invalid-root',
        });
    });
});
