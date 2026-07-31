// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
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
});
