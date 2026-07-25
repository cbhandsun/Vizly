// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getFlowDataBridge,
    getFlowDataBridgeEdges,
    getFlowDataBridgeNodes,
    getFlowDataBridgeRegistry,
    registerFlowDataBridge,
    registerFlowDesignerCloudOpener,
    removeFlowDataBridge,
} from '../flowDataBridge';

describe('flowDataBridge', () => {
    beforeEach(() => {
        delete window.__flowDataBridge;
        delete window.__flowDesignerOpenCloud;
    });

    it('returns undefined when the global bridge registry is missing or invalid', () => {
        expect(getFlowDataBridgeRegistry()).toBeUndefined();
        expect(getFlowDataBridge('diagram-a')).toBeUndefined();

        Object.defineProperty(window, '__flowDataBridge', {
            configurable: true,
            writable: true,
            value: 'bad',
        });
        expect(getFlowDataBridgeRegistry()).toBeUndefined();
    });

    it('reads bridge entries and coerces nodes and edges to arrays', () => {
        window.__flowDataBridge = {
            'diagram-a': {
                id: 'diagram-a',
                nodes: [{ id: 'n1' }],
                edges: [{ id: 'e1' }],
            },
            'diagram-b': {
                id: 'diagram-b',
                nodes: 'bad' as unknown as unknown[],
                edges: null as unknown as unknown[],
            },
        };

        expect(getFlowDataBridge('diagram-a')?.id).toBe('diagram-a');
        expect(getFlowDataBridgeNodes('diagram-a')).toEqual([{ id: 'n1' }]);
        expect(getFlowDataBridgeEdges('diagram-a')).toEqual([{ id: 'e1' }]);
        expect(getFlowDataBridgeNodes('diagram-b')).toEqual([]);
        expect(getFlowDataBridgeEdges('diagram-b')).toEqual([]);
    });

    it('removes bridge entries without disturbing unrelated diagrams', () => {
        window.__flowDataBridge = {
            'diagram-a': { id: 'diagram-a' },
            'diagram-b': { id: 'diagram-b' },
        };

        removeFlowDataBridge('diagram-a');

        expect(window.__flowDataBridge?.['diagram-a']).toBeUndefined();
        expect(window.__flowDataBridge?.['diagram-b']).toEqual({ id: 'diagram-b' });
    });

    it('does not let stale cleanup remove a newer bridge owner', () => {
        const first = { id: 'first' };
        const second = { id: 'second' };
        const cleanupFirst = registerFlowDataBridge('diagram', first);
        const cleanupSecond = registerFlowDataBridge('diagram', second);

        cleanupFirst();
        expect(getFlowDataBridge('diagram')).toBe(second);

        cleanupSecond();
        expect(getFlowDataBridge('diagram')).toBeUndefined();
    });

    it('keeps the newest cloud opener when an older owner unmounts', () => {
        const first = vi.fn();
        const second = vi.fn();
        const cleanupFirst = registerFlowDesignerCloudOpener(first);
        const cleanupSecond = registerFlowDesignerCloudOpener(second);

        cleanupFirst();
        expect(window.__flowDesignerOpenCloud).toBe(second);

        cleanupSecond();
        expect(window.__flowDesignerOpenCloud).toBeUndefined();
    });
});
