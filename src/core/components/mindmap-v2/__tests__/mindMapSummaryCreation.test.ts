// @vitest-environment jsdom

import type { MindElixirData, Topic } from 'mind-elixir';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createMindMapSummaryForSelection,
    type MindMapSummaryHost,
} from '../mindMapSummaryCreation';
import { setActiveMindMapSelection } from '../mindMapSelectionStore';

const createTopic = (nodeId: string): Topic => {
    const topic = document.createElement('me-tpc') as Topic;
    topic.dataset.nodeid = nodeId;
    return topic;
};

const createHost = (options: {
    selectedNodeId?: string;
    rootId?: string;
    throwOnFind?: boolean;
    throwOnCreate?: boolean;
} = {}): MindMapSummaryHost => {
    const container = document.createElement('div');
    const currentNodes: Topic[] = [];
    const topic = createTopic(options.selectedNodeId ?? 'node-1');
    return {
        container,
        currentNode: null,
        currentNodes,
        getData: () => ({
            nodeData: { id: options.rootId ?? 'root', topic: 'Root' },
        } as MindElixirData),
        findEle: () => {
            if (options.throwOnFind) throw new Error('missing');
            return topic;
        },
        selectNode: selected => {
            currentNodes.splice(0, currentNodes.length, selected);
        },
        createSummary: () => {
            if (options.throwOnCreate) throw new Error('create failed');
        },
    };
};

afterEach(() => setActiveMindMapSelection(null));

describe('createMindMapSummaryForSelection', () => {
    it('reselects the requested node before creating a summary', () => {
        const host = createHost({ selectedNodeId: 'node-1' });
        const selectNode = vi.spyOn(host, 'selectNode');
        const createSummary = vi.spyOn(host, 'createSummary');

        expect(createMindMapSummaryForSelection(host, 'node-1')).toEqual({
            ok: true,
            nodeId: 'node-1',
            message: '已创建汇总括号',
        });
        expect(selectNode).toHaveBeenCalledTimes(1);
        expect(createSummary).toHaveBeenCalledTimes(1);
    });

    it('reports missing and root selections instead of silently clearing state', () => {
        const host = createHost();
        expect(createMindMapSummaryForSelection(host)).toMatchObject({ ok: false, code: 'no-selection' });
        expect(createMindMapSummaryForSelection(host, 'root')).toMatchObject({
            ok: false,
            code: 'root-not-supported',
        });
    });

    it('uses the central active selection when the toolbar has no node id', () => {
        setActiveMindMapSelection({ id: 'node-1', topic: 'Selected' });
        expect(createMindMapSummaryForSelection(createHost())).toMatchObject({
            ok: true,
            nodeId: 'node-1',
        });
    });

    it('returns safe failures for stale nodes and library errors', () => {
        expect(createMindMapSummaryForSelection(createHost({ throwOnFind: true }), 'node-1'))
            .toMatchObject({ ok: false, code: 'node-not-found', message: '选中节点已失效，请重新选择' });
        expect(createMindMapSummaryForSelection(createHost({ throwOnCreate: true }), 'node-1'))
            .toMatchObject({ ok: false, code: 'create-failed', message: '创建汇总括号失败，请重试' });
    });
});

