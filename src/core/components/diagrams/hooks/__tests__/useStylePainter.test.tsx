// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
    applyCopiedStyleToNodes,
    copyNodeVisualStyle,
    useStylePainter,
} from '../useStylePainter';

const sourceNode = (): Node => ({
    id: 'source',
    position: { x: 0, y: 0 },
    data: {
        label: 'Source',
        shape: 'diamond',
        theme: { main: '#334455', border: '#112233' },
        style: { fontWeight: 700 },
        icon: 'star',
    },
    style: { opacity: 0.4, strokeWidth: 2, strokeDasharray: '4,4', width: 240 },
});

const targetNode = (locked = false): Node => ({
    id: 'target',
    position: { x: 120, y: 0 },
    data: {
        label: 'Target',
        shape: 'rectangle',
        theme: { main: '#ffffff' },
        style: { fontSize: 12 },
        locked,
    },
    draggable: !locked,
    style: { opacity: 1, strokeWidth: 1, width: 100 },
});

describe('useStylePainter', () => {
    it('copies visual styling without copying layout dimensions', () => {
        const source = sourceNode();
        const target = targetNode();
        const copiedStyle = copyNodeVisualStyle(source);
        const result = applyCopiedStyleToNodes(
            [source, target],
            new Set(['target']),
            copiedStyle,
        );

        expect(result.changed).toBe(true);
        expect(result.nodes[1]).toMatchObject({
            data: {
                label: 'Target',
                shape: 'diamond',
                theme: { main: '#334455', border: '#112233' },
                style: { fontSize: 12, fontWeight: 700 },
                icon: 'star',
            },
            style: {
                opacity: 0.4,
                strokeWidth: 2,
                strokeDasharray: '4,4',
                width: 100,
            },
        });

        expect(applyCopiedStyleToNodes(
            result.nodes,
            new Set(['target']),
            copiedStyle,
        ).changed).toBe(false);
    });

    it('snapshots a paste once, synchronizes selection, and rejects locked targets', () => {
        const initialNodes = [sourceNode(), targetNode()];
        const nodesRef = { current: initialNodes };
        const edgesRef = { current: [] as Edge[] };
        const takeSnapshot = vi.fn();
        const setNodes = vi.fn((value: SetStateAction<Node[]>) => {
            nodesRef.current = typeof value === 'function' ? value(nodesRef.current) : value;
        }) as Dispatch<SetStateAction<Node[]>>;
        const selectedRef = { current: [initialNodes[1]] };
        const setSelectedNodes = vi.fn((value: SetStateAction<Node[]>) => {
            selectedRef.current = typeof value === 'function' ? value(selectedRef.current) : value;
        }) as Dispatch<SetStateAction<Node[]>>;
        const { result } = renderHook(() => useStylePainter({
            setNodes,
            setSelectedNodes,
            takeSnapshot,
            nodesRef,
            edgesRef,
        }));

        act(() => result.current.copyStyle(initialNodes[0]));
        act(() => result.current.pasteStyle(['target']));

        expect(takeSnapshot).toHaveBeenCalledTimes(1);
        expect(nodesRef.current[1].style).toMatchObject({ opacity: 0.4, strokeWidth: 2 });
        expect(selectedRef.current[0]).toBe(nodesRef.current[1]);

        act(() => result.current.pasteStyle(['target']));
        expect(takeSnapshot).toHaveBeenCalledTimes(1);

        const locked = targetNode(true);
        nodesRef.current = [sourceNode(), locked];
        selectedRef.current = [locked];
        act(() => result.current.pasteStyle(['target']));
        expect(takeSnapshot).toHaveBeenCalledTimes(1);
        expect(nodesRef.current[1]).toBe(locked);
    });
});
