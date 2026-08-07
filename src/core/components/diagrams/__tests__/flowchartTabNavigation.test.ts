// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
    focusAddedFlowchartNodeById,
    focusFlowchartEdgeById,
    focusFlowchartNodeById,
    shouldHandleFlowchartCanvasTab,
} from '../flowchartTabNavigation';

describe('flowchartTabNavigation', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('does not hijack Tab from toolbar controls, nodes, edges, or editable fields', () => {
        document.body.innerHTML = `
            <button id="toolbar">文档操作</button>
            <div class="react-flow" tabindex="0">
                <div class="react-flow__pane"></div>
                <div class="react-flow__node" tabindex="0"></div>
                <input />
            </div>
        `;
        const toolbar = document.querySelector<HTMLElement>('#toolbar');
        const canvas = document.querySelector<HTMLElement>('.react-flow');
        const node = document.querySelector<HTMLElement>('.react-flow__node');
        const input = document.querySelector<HTMLElement>('input');
        if (!toolbar || !canvas || !node || !input) throw new Error('test fixture missing');

        toolbar.focus();
        expect(shouldHandleFlowchartCanvasTab({
            key: 'Tab',
            target: toolbar,
            activeElement: document.activeElement,
        })).toBe(false);

        node.focus();
        expect(shouldHandleFlowchartCanvasTab({
            key: 'Tab',
            target: node,
            activeElement: document.activeElement,
        })).toBe(false);

        input.focus();
        expect(shouldHandleFlowchartCanvasTab({
            key: 'Tab',
            target: input,
            activeElement: document.activeElement,
        })).toBe(false);
    });

    it('allows canvas-root cycling and moves semantic focus to the selected node', () => {
        document.body.innerHTML = `
            <div class="react-flow" tabindex="0">
                <div class="react-flow__node" data-id="node-1" tabindex="-1"></div>
            </div>
        `;
        const canvas = document.querySelector<HTMLElement>('.react-flow');
        if (!canvas) throw new Error('test fixture missing');
        canvas.focus();

        expect(shouldHandleFlowchartCanvasTab({
            key: 'Tab',
            target: canvas,
            activeElement: document.activeElement,
        })).toBe(true);
        expect(focusFlowchartNodeById(document, 'node-1')).toBe(true);
        expect(document.activeElement?.getAttribute('data-id')).toBe('node-1');
        expect(focusFlowchartNodeById(document, '')).toBe(false);
        expect(focusFlowchartNodeById(document, 'x'.repeat(1_025))).toBe(false);
        expect(focusFlowchartNodeById(document, 'missing')).toBe(false);
    });

    it('hands added-node focus to the selected semantic target with a safe container fallback', () => {
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="node-1" tabindex="0">
                <div id="selected-target" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
            <div class="react-flow__node" data-id="node-2" tabindex="0"></div>
        `;
        const selectedTarget = document.querySelector<HTMLElement>('#selected-target');
        const fallbackTarget = document.querySelector<HTMLElement>('[data-id="node-2"]');
        if (!selectedTarget || !fallbackTarget) throw new Error('test fixture missing');

        expect(focusAddedFlowchartNodeById(document, 'node-1')).toBe(true);
        expect(document.activeElement).toBe(selectedTarget);
        expect(focusAddedFlowchartNodeById(document, 'node-2')).toBe(true);
        expect(document.activeElement).toBe(fallbackTarget);

        expect(focusAddedFlowchartNodeById(document, '')).toBe(false);
        expect(focusAddedFlowchartNodeById(document, 'x'.repeat(1_025))).toBe(false);
        expect(focusAddedFlowchartNodeById(document, 'missing')).toBe(false);
        expect(focusAddedFlowchartNodeById(document, 'node-1"] .unsafe')).toBe(false);
    });

    it('hands pointer-selected edge focus to its safe focusable container', () => {
        document.body.innerHTML = `
            <div class="react-flow__edge" data-id="edge-1" tabindex="0"></div>
            <div class="react-flow__edge" data-id="edge-2" tabindex="0"></div>
        `;
        const edge = document.querySelector<HTMLElement>('[data-id="edge-2"]');
        if (!edge) throw new Error('test fixture missing');

        expect(focusFlowchartEdgeById(document, 'edge-2')).toBe(true);
        expect(document.activeElement).toBe(edge);
        expect(focusFlowchartEdgeById(document, '')).toBe(false);
        expect(focusFlowchartEdgeById(document, 'x'.repeat(1_025))).toBe(false);
        expect(focusFlowchartEdgeById(document, 'missing')).toBe(false);
        expect(focusFlowchartEdgeById(document, 'edge-1"] .unsafe')).toBe(false);
    });
});
