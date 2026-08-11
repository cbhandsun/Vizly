// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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
