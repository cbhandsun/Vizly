import { beforeEach, describe, expect, it } from 'vitest';
import {
    getFlowDataBridge,
    getFlowDataBridgeEdges,
    getFlowDataBridgeNodes,
    getFlowDataBridgeRegistry,
    removeFlowDataBridge,
} from '../flowDataBridge';

describe('flowDataBridge', () => {
    beforeEach(() => {
        delete window.__flowDataBridge;
    });

    it('returns undefined when the global bridge registry is missing or invalid', () => {
        expect(getFlowDataBridgeRegistry()).toBeUndefined();
        expect(getFlowDataBridge('diagram-a')).toBeUndefined();

        (window as Window & { __flowDataBridge?: unknown }).__flowDataBridge = 'bad';
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
});
