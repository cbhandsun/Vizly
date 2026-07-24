// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Node } from '@xyflow/react';

import {
    coerceFlowchartSummarySourceIds,
    createFlowchartDesignerCommandEventHandler,
    createFlowchartSummaryEventHandler,
} from '../flowchartDesignerEventHandlers';

describe('flowchartDesignerEventHandlers', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
    });

    it('coerces, bounds, and deduplicates summary source ids', () => {
        expect(coerceFlowchartSummarySourceIds({
            sourceIds: [' node-1 ', 'node-1', 2, '', 'node-2'],
        })).toEqual(['node-1', 'node-2']);
        expect(coerceFlowchartSummarySourceIds(null)).toEqual([]);
        expect(coerceFlowchartSummarySourceIds({ sourceIds: 'node-1' })).toEqual([]);
        expect(coerceFlowchartSummarySourceIds({ sourceIds: ['x'.repeat(257), 'ok'] }))
            .toEqual(['ok']);

        const manyIds = Array.from({ length: 1_100 }, (_, index) => `node-${index}`);
        expect(coerceFlowchartSummarySourceIds({ sourceIds: manyIds })).toHaveLength(1_000);
    });

    it('creates a command handler using current window dimensions and toolbar lookup', () => {
        vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 });
        document.body.innerHTML = '<button data-id="toolbar-export-btn"></button>';

        const click = vi.fn();
        (document.querySelector('[data-id="toolbar-export-btn"]') as HTMLButtonElement).click = click;

        const handler = createFlowchartDesignerCommandEventHandler({
            handleSmartLayout: vi.fn(),
            handleStrategyLayout: vi.fn(),
            handleExport: vi.fn(),
            setAiChatVisible: vi.fn(),
            setActiveRightTab: vi.fn(),
            reactFlowInstance: null,
            setNodes: vi.fn(),
            newNodeLabel: 'New Node',
            confirmClearCanvas: vi.fn(),
        });

        const handled = handler({
            detail: { action: 'export-png' },
        });

        expect(handled).toBe(true);
        expect(click).toHaveBeenCalled();
    });

    it('creates a summary handler that inserts and selects the summary node', () => {
        const takeSnapshot = vi.fn();
        const scheduledCallbacks: Array<() => void> = [];
        const setNodes = vi.fn((updater: (nodes: Node[]) => Node[]) => updater([
            {
                id: 'n1',
                position: { x: 10, y: 20 },
                data: { label: 'Node 1' },
            } as Node,
        ]));

        const handler = createFlowchartSummaryEventHandler({
            nodesRef: {
                current: [
                    {
                        id: 'n1',
                        position: { x: 10, y: 20 },
                        data: { label: 'Node 1' },
                    } as Node,
                ],
            },
            edgesRef: { current: [] },
            label: 'Summary',
            takeSnapshot,
            setNodes,
            scheduleSelection: (callback) => {
                scheduledCallbacks.push(callback);
            },
        });

        const summaryNode = handler({
            detail: {
                sourceIds: ['n1'],
            },
        });

        expect(summaryNode).not.toBeNull();
        expect(takeSnapshot).toHaveBeenCalled();
        expect(setNodes).toHaveBeenCalled();
        expect(scheduledCallbacks).toHaveLength(1);

        scheduledCallbacks[0]();
        expect(setNodes).toHaveBeenCalledTimes(2);
    });

    it('returns null when summary insertion has no source ids', () => {
        const handler = createFlowchartSummaryEventHandler({
            nodesRef: { current: [] },
            edgesRef: { current: [] },
            label: 'Summary',
            takeSnapshot: vi.fn(),
            setNodes: vi.fn(),
        });

        expect(handler({ detail: {} })).toBeNull();
        expect(handler({})).toBeNull();
        expect(handler({ detail: null })).toBeNull();
        expect(handler({ detail: { sourceIds: [1, {}, ''] } })).toBeNull();
    });
});
