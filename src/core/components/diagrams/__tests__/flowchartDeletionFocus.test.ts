// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    resolveFlowchartCutFocusNodeId,
    resolveFlowchartEdgeDeletionFocusTarget,
    resolveFlowchartDeletionFocusNodeId,
    scheduleFlowchartDeletionEdgeFocus,
    scheduleFlowchartDeletionNodeFocus,
} from '../flowchartDeletionFocus';

const node = (id: string, x: number, y = 0): Node => ({
    id,
    position: { x, y },
    data: {},
});

const renderFocusedNode = (nodeId: string): HTMLElement => {
    document.body.innerHTML = `
        <div class="react-flow__node" data-id="${nodeId}">
            <div id="focused-node" role="treeitem" tabindex="0"></div>
        </div>
    `;
    const focused = document.querySelector<HTMLElement>('#focused-node');
    if (!focused) throw new Error('test fixture missing');
    return focused;
};

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });

describe('flowchart deletion focus', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('chooses the nearest valid survivor when the focused node is deleted', () => {
        const focused = renderFocusedNode('target');

        expect(resolveFlowchartDeletionFocusNodeId(
            [node('far', -200), node('target', 100), node('near', 140)],
            new Set(['target']),
            focused,
        )).toBe('near');
    });

    it('keeps focus when deletion originates outside the focused target', () => {
        const focused = renderFocusedNode('survivor');
        const toolbar = document.createElement('button');

        expect(resolveFlowchartDeletionFocusNodeId(
            [node('survivor', 0), node('target', 100)],
            new Set(['target']),
            focused,
        )).toBeNull();
        expect(resolveFlowchartDeletionFocusNodeId(
            [node('survivor', 0), node('target', 100)],
            new Set(['target']),
            toolbar,
        )).toBeNull();
    });

    it('falls back deterministically for invalid geometry and rejects unsafe ids or no survivors', () => {
        const focused = renderFocusedNode('target');
        const invalidAnchor = { ...node('target', 0), position: { x: Number.NaN, y: 0 } };

        expect(resolveFlowchartDeletionFocusNodeId(
            [invalidAnchor, node('first', 300), node('second', 10)],
            new Set(['target']),
            focused,
        )).toBe('first');
        expect(resolveFlowchartDeletionFocusNodeId(
            [node('target', 0)],
            new Set(['target']),
            focused,
        )).toBeNull();

        const oversizedId = 'x'.repeat(1_025);
        const oversizedFocus = renderFocusedNode(oversizedId);
        expect(resolveFlowchartDeletionFocusNodeId(
            [node(oversizedId, 0), node('safe', 10)],
            new Set([oversizedId]),
            oversizedFocus,
        )).toBeNull();
    });

    it('uses every cut node as a spatial anchor when focus is inside a transient menu', () => {
        expect(resolveFlowchartCutFocusNodeId(
            [
                node('left-survivor', -100),
                node('first-cut', 0),
                node('second-cut', 400),
                node('right-survivor', 430),
            ],
            new Set(['first-cut', 'second-cut']),
        )).toBe('right-survivor');
    });

    it('keeps cut focus resolution deterministic for invalid ids, geometry, and empty survivors', () => {
        const invalidCut = { ...node('cut', 0), position: { x: Number.NaN, y: 0 } };

        expect(resolveFlowchartCutFocusNodeId(
            [invalidCut, node('first', 300), node('second', 10)],
            new Set(['cut']),
        )).toBe('first');
        expect(resolveFlowchartCutFocusNodeId(
            [node('cut', 0)],
            new Set(['cut']),
        )).toBeNull();
        expect(resolveFlowchartCutFocusNodeId(
            [node('safe', 0), node('x'.repeat(1_025), 10)],
            new Set(['x'.repeat(1_025)]),
        )).toBeNull();
    });

    it('continues to an adjacent edge after deleting the focused relationship', () => {
        document.body.innerHTML = '<svg><g class="react-flow__edge" data-id="edge-a" tabindex="0"></g></svg>';
        const focusedEdge = document.querySelector<Element>('[data-id="edge-a"]');
        if (!focusedEdge) throw new Error('test fixture missing');

        expect(resolveFlowchartEdgeDeletionFocusTarget(
            [node('a', 0), node('b', 100), node('c', 200)],
            [edge('unrelated', 'x', 'y'), edge('edge-a', 'a', 'b'), edge('edge-b', 'b', 'c')],
            new Set(['edge-a']),
            focusedEdge,
        )).toEqual({ kind: 'edge', id: 'edge-b' });
    });

    it('falls back to the target endpoint and rejects unrelated or unsafe edge anchors', () => {
        const nodes = [node('source', 0), node('target', 100)];
        const edges = [edge('edge-a', 'source', 'target')];
        const toolbar = document.createElement('button');

        expect(resolveFlowchartEdgeDeletionFocusTarget(
            nodes,
            edges,
            new Set(['edge-a']),
            toolbar,
            'edge-a',
        )).toEqual({ kind: 'node', id: 'target' });
        expect(resolveFlowchartEdgeDeletionFocusTarget(
            nodes,
            edges,
            new Set(['edge-a']),
            toolbar,
        )).toBeNull();
        expect(resolveFlowchartEdgeDeletionFocusTarget(
            nodes,
            [edge('edge-a', 'source', 'x'.repeat(1_025))],
            new Set(['edge-a']),
            toolbar,
            'edge-a',
        )).toBeNull();
    });

    it('waits for the selected semantic survivor and supports cancellation', () => {
        const frames: FrameRequestCallback[] = [];
        const cancelled = new Set<number>();
        let nextFrameId = 0;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            nextFrameId += 1;
            return nextFrameId;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frameId => {
            cancelled.add(frameId);
        });

        expect(scheduleFlowchartDeletionNodeFocus('survivor', document)).not.toBeNull();
        frames.shift()?.(0);
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="survivor" tabindex="0">
                <div id="survivor" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        frames.shift()?.(16);
        expect(document.activeElement?.id).toBe('survivor');

        const cancelledRequest = scheduleFlowchartDeletionNodeFocus('cancelled', document);
        cancelledRequest?.cancel();
        expect(cancelled).toContain(3);
        expect(scheduleFlowchartDeletionNodeFocus('', document)).toBeNull();
        expect(scheduleFlowchartDeletionNodeFocus('x'.repeat(1_025), document)).toBeNull();
    });

    it('waits for a surviving edge before restoring relationship focus', () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });

        expect(scheduleFlowchartDeletionEdgeFocus('edge-b', document)).not.toBeNull();
        frames.shift()?.(0);
        document.body.innerHTML = '<svg><g id="edge-b" class="react-flow__edge selected" data-id="edge-b" tabindex="0"></g></svg>';
        frames.shift()?.(16);
        expect(document.activeElement?.id).toBe('edge-b');
        expect(scheduleFlowchartDeletionEdgeFocus('', document)).toBeNull();
        expect(scheduleFlowchartDeletionEdgeFocus('x'.repeat(1_025), document)).toBeNull();
    });
});
