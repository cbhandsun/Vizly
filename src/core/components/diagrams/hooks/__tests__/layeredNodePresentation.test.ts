import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import {
    reconcileLayeredNodePresentation,
    type LayeredNodePresentationCache,
} from '../layeredNodePresentation';

const layers = [{
    id: 'layer-0',
    name: 'Base',
    visible: true,
    locked: false,
    zIndex: 0,
}];

const getLayer = (id: string) => layers.find(layer => layer.id === id);

const createNodes = (): Node[] => [{
    id: 'group',
    type: 'titleGroup',
    position: { x: 0, y: 0 },
    data: {},
    style: { zIndex: -10 },
}, {
    id: 'child-a',
    parentId: 'group',
    position: { x: 10, y: 10 },
    data: {},
}, {
    id: 'child-b',
    parentId: 'group',
    position: { x: 20, y: 20 },
    data: {},
}];

describe('reconcileLayeredNodePresentation', () => {
    it('reuses unaffected rendered nodes when one source node moves', () => {
        const cache: LayeredNodePresentationCache = new Map();
        const source = createNodes();
        const first = reconcileLayeredNodePresentation({ nodes: source, getLayer, previous: cache });
        const moved = source.map(node => (
            node.id === 'child-a'
                ? { ...node, position: { x: 30, y: 40 } }
                : node
        ));
        const second = reconcileLayeredNodePresentation({ nodes: moved, getLayer, previous: cache });

        expect(second[0]).toBe(first[0]);
        expect(second[1]).not.toBe(first[1]);
        expect(second[2]).toBe(first[2]);
        expect(second[1].style?.zIndex).toBe(10);
    });

    it('invalidates descendant presentation when an ancestor is selected', () => {
        const cache: LayeredNodePresentationCache = new Map();
        const source = createNodes();
        const first = reconcileLayeredNodePresentation({ nodes: source, getLayer, previous: cache });
        const selected = source.map(node => (
            node.id === 'group' ? { ...node, selected: true } : node
        ));
        const second = reconcileLayeredNodePresentation({ nodes: selected, getLayer, previous: cache });

        expect(second[0]).not.toBe(first[0]);
        expect(second[1]).not.toBe(first[1]);
        expect(second[2]).not.toBe(first[2]);
        expect(second[1].style?.zIndex).toBe(2010);
    });

    it('applies hidden and locked layer state without mutating input nodes', () => {
        const cache: LayeredNodePresentationCache = new Map();
        const source = createNodes();
        const lockedLayer = {
            ...layers[0],
            visible: false,
            locked: true,
        };
        const result = reconcileLayeredNodePresentation({
            nodes: source,
            getLayer: () => lockedLayer,
            previous: cache,
        });

        expect(result.every(node => node.hidden)).toBe(true);
        expect(result.every(node => node.draggable === false)).toBe(true);
        expect(result.every(node => node.selectable === false)).toBe(true);
        expect(source.every(node => node.hidden === undefined)).toBe(true);
    });
});
