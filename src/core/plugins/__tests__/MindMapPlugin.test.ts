import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '../../types/plugin';
import { MindMapPlugin } from '../MindMapPlugin';

const context = { diagramId: 'mindmap-1' } as PluginContext;

describe('MindMapPlugin boundaries', () => {
    beforeEach(() => {
        vi.stubGlobal('window', {});
    });

    afterEach(() => {
        delete window.__flowDataBridge;
        vi.unstubAllGlobals();
    });

    it('rejects malformed AI action parameters and normalizes valid child input', async () => {
        const addChild = vi.fn();
        window.__flowDataBridge = { 'mindmap-1': { addChild } };
        const plugin = new MindMapPlugin();

        await expect(plugin.onAIAction('addChild', [], context)).resolves.toBe(false);
        await expect(plugin.onAIAction('addChild', { label: '' }, context)).resolves.toBe(false);
        await expect(plugin.onAIAction('addChild', {
            parentId: ' parent ',
            label: ' Child ',
            side: 'invalid',
        }, context)).resolves.toBe(true);

        expect(addChild).toHaveBeenCalledWith({ parentId: 'parent', label: 'Child', side: undefined });
    });

    it('bounds delete requests to validated string ids', async () => {
        const deleteNodes = vi.fn();
        window.__flowDataBridge = { 'mindmap-1': { deleteNodes } };

        await expect(new MindMapPlugin().onAIAction('deleteNodes', {
            ids: [' first ', null, '', 'second'],
        }, context)).resolves.toBe(true);

        expect(deleteNodes).toHaveBeenCalledWith(['first', 'second']);
    });
});
