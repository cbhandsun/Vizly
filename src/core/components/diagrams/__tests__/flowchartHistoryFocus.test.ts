// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    resolveHistoryNodeFocusAfterChange,
    resolveUndoRestoredNodeFocusId,
    scheduleUndoRestoredNodeFocus,
    shouldFocusEmptyStateAfterRedo,
} from '../flowchartHistoryFocus';

const node = (id: string, selected = false): Node => ({
    id,
    position: { x: 0, y: 0 },
    data: {},
    selected,
});

describe('flowchartHistoryFocus', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('targets the selected survivor when history removes the focused node', () => {
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="source">
                <div role="treeitem"></div>
            </div>
            <div class="react-flow__node" data-id="new-node">
                <div id="focused-new-node" role="treeitem" tabindex="0"></div>
            </div>
        `;
        const focused = document.querySelector<HTMLElement>('#focused-new-node');
        if (!focused) throw new Error('test fixture missing');

        expect(resolveHistoryNodeFocusAfterChange(
            [node('source'), node('new-node')],
            [node('source', true)],
            focused,
        )).toBe('source');
    });

    it('moves focus to a different selected node when history changes semantic selection', () => {
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="source">
                <div id="source-node" role="treeitem" tabindex="0"></div>
            </div>
        `;
        const source = document.querySelector<HTMLElement>('#source-node');
        if (!source) throw new Error('test fixture missing');

        expect(resolveHistoryNodeFocusAfterChange(
            [node('source', true)],
            [node('source'), node('redone-node', true)],
            source,
        )).toBe('redone-node');
    });

    it('does not steal focus when selection stays aligned or focus originated outside the canvas', () => {
        document.body.innerHTML = `
            <button id="toolbar">Undo</button>
            <div class="react-flow__node" data-id="source">
                <div id="source-node" role="treeitem" tabindex="0"></div>
            </div>
        `;
        const source = document.querySelector<HTMLElement>('#source-node');
        const toolbar = document.querySelector<HTMLElement>('#toolbar');
        if (!source || !toolbar) throw new Error('test fixture missing');

        expect(resolveHistoryNodeFocusAfterChange(
            [node('source')],
            [node('source')],
            source,
        )).toBeNull();
        expect(resolveHistoryNodeFocusAfterChange(
            [node('source')],
            [],
            toolbar,
        )).toBeNull();
    });

    it('rejects stale and oversized focused node ids', () => {
        const oversizedId = 'x'.repeat(1_025);
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="stale"><div id="stale" tabindex="0"></div></div>
            <div class="react-flow__node" data-id="${oversizedId}"><div id="oversized" tabindex="0"></div></div>
        `;
        const stale = document.querySelector<HTMLElement>('#stale');
        const oversized = document.querySelector<HTMLElement>('#oversized');
        if (!stale || !oversized) throw new Error('test fixture missing');

        expect(resolveHistoryNodeFocusAfterChange(
            [node('source')],
            [node('', true), node('fallback')],
            stale,
        )).toBeNull();
        expect(resolveHistoryNodeFocusAfterChange(
            [node(oversizedId)],
            [node('fallback')],
            oversized,
        )).toBeNull();
    });

    it('targets the selected restored node when undo replaces the focused empty state', () => {
        document.body.innerHTML = '<button class="flowchart-empty-action">Choose a shape</button>';
        const emptyAction = document.querySelector<HTMLButtonElement>('.flowchart-empty-action');
        if (!emptyAction) throw new Error('test fixture missing');

        expect(resolveUndoRestoredNodeFocusId(
            [],
            [node('node-1'), node('node-2', true)],
            emptyAction,
        )).toBe('node-2');
    });

    it('falls back to the first restored node and rejects unrelated focus transitions', () => {
        const emptyAction = document.createElement('button');
        emptyAction.className = 'flowchart-empty-action';
        const toolbarAction = document.createElement('button');

        expect(resolveUndoRestoredNodeFocusId([], [node('node-1')], emptyAction)).toBe('node-1');
        expect(resolveUndoRestoredNodeFocusId([node('existing')], [node('node-1')], emptyAction)).toBeNull();
        expect(resolveUndoRestoredNodeFocusId([], [], emptyAction)).toBeNull();
        expect(resolveUndoRestoredNodeFocusId([], [node('node-1')], toolbarAction)).toBeNull();
        expect(resolveUndoRestoredNodeFocusId([], [node('')], emptyAction)).toBeNull();
        expect(resolveUndoRestoredNodeFocusId([], [node('node-1')], null)).toBeNull();
    });

    it('targets the empty state only when redo removes the focused canvas node', () => {
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="node-1">
                <div id="selected-node" role="treeitem" tabindex="0"></div>
            </div>
            <button id="toolbar-redo">Redo</button>
        `;
        const selectedNode = document.querySelector<HTMLElement>('#selected-node');
        const toolbarRedo = document.querySelector<HTMLButtonElement>('#toolbar-redo');
        if (!selectedNode || !toolbarRedo) throw new Error('test fixture missing');

        expect(shouldFocusEmptyStateAfterRedo([node('node-1')], [], selectedNode)).toBe(true);
        expect(shouldFocusEmptyStateAfterRedo([], [], selectedNode)).toBe(false);
        expect(shouldFocusEmptyStateAfterRedo([node('node-1')], [node('node-1')], selectedNode)).toBe(false);
        expect(shouldFocusEmptyStateAfterRedo([node('node-1')], [], toolbarRedo)).toBe(false);
        expect(shouldFocusEmptyStateAfterRedo([node('node-1')], [], null)).toBe(false);
    });

    it('waits for the restored semantic node target and then focuses it', () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

        expect(scheduleUndoRestoredNodeFocus('node-1', document)).not.toBeNull();
        expect(frames).toHaveLength(1);
        frames.shift()?.(0);
        expect(frames).toHaveLength(1);

        document.body.innerHTML = `
            <div class="react-flow__node" data-id="node-1" tabindex="0">
                <div id="semantic-node" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        frames.shift()?.(16);

        expect(document.activeElement?.id).toBe('semantic-node');
    });

    it('supports cancellation and rejects invalid scheduling input', () => {
        const frames: FrameRequestCallback[] = [];
        const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return 42;
        });

        const request = scheduleUndoRestoredNodeFocus('node-1', document);
        request?.cancel();
        frames.shift()?.(0);

        expect(cancel).toHaveBeenCalledWith(42);
        expect(document.activeElement).toBe(document.body);
        expect(scheduleUndoRestoredNodeFocus('', document)).toBeNull();
        expect(scheduleUndoRestoredNodeFocus('x'.repeat(1_025), document)).toBeNull();
    });
});
