import { beforeEach, describe, expect, it } from 'vitest';
import { EdgeRoutingCache } from '../EdgeRoutingCache';
import type { PathFindingResult } from '../../types/routing';

const makeResult = (edgeId: string): PathFindingResult => ({
    jobId: edgeId,
    edgeId,
    path: `M 0 0 L 10 10`,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    labelX: 5,
    labelY: 5,
});

describe('EdgeRoutingCache', () => {
    const cache = EdgeRoutingCache.getInstance();

    beforeEach(() => {
        cache.clear();
    });

    it('invalidates keys when route version, handles, or port sides change', () => {
        const base = {
            rv: 12,
            s: 'source',
            t: 'target',
            sx: 10,
            sy: 20,
            tx: 30,
            ty: 40,
            sr: '0,0,100,80',
            tr: '200,0,100,80',
            type: 's',
            sourceHandle: '',
            targetHandle: '',
            sourcePosition: 'bottom',
            targetPosition: 'top',
            bus: '',
            pe: 0,
            version: 1,
        };

        const key = cache.generateKey('edge-a', base);

        expect(cache.generateKey('edge-a', { ...base, rv: 13 })).not.toBe(key);
        expect(cache.generateKey('edge-a', { ...base, targetPosition: 'left' })).not.toBe(key);
        expect(cache.generateKey('edge-a', { ...base, targetHandle: 'custom-top' })).not.toBe(key);
    });

    it('deletes pipe-delimited edge keys by edge id', () => {
        const keyA = cache.generateKey('edge-a', { s: 'a', t: 'b', version: 1 });
        const keyB = cache.generateKey('edge-b', { s: 'b', t: 'c', version: 1 });

        cache.set(keyA, makeResult('edge-a'));
        cache.set(keyB, makeResult('edge-b'));

        cache.deleteByEdgeId('edge-a');

        expect(cache.get(keyA)).toBeUndefined();
        expect(cache.get(keyB)).toBeDefined();
    });
});
