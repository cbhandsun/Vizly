// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
    applyMindElixirPalette,
    clearMindElixirPalette,
    coerceMindElixirPalette,
} from '../mindElixirThemeDom';
import {
    isSupportedMindMapImportFile,
    parseMindMapImportText,
} from '../useMindElixirFileDrop';
import { createMindElixirArrowModeController } from '../mindElixirArrowModeController';
import type { MindElixirInstance, Topic } from 'mind-elixir';

describe('mind elixir wrapper boundaries', () => {
    it('accepts bounded hex palettes and rejects unsafe CSS values', () => {
        expect(coerceMindElixirPalette({
            palette: [' #abc ', '#123456', '#12345678', 'url(https://example.test/x)', 123, 'red'],
        })).toEqual(['#abc', '#123456', '#12345678']);
        expect(coerceMindElixirPalette(null)).toEqual([]);
        expect(coerceMindElixirPalette({ palette: 'not-an-array' })).toEqual([]);
        expect(coerceMindElixirPalette({ palette: Array.from({ length: 20 }, () => '#fff') })).toHaveLength(10);
    });

    it('clears stale variables before applying a new palette', () => {
        const style = {
            removeProperty: vi.fn(),
            setProperty: vi.fn(),
        };

        applyMindElixirPalette(style, { palette: ['#6366f1', '#8b5cf6'] });
        expect(style.removeProperty).toHaveBeenCalledTimes(10);
        expect(style.setProperty).toHaveBeenNthCalledWith(1, '--vizly-mindmap-branch-1', '#6366f1');
        expect(style.setProperty).toHaveBeenNthCalledWith(2, '--vizly-mindmap-branch-2', '#8b5cf6');

        clearMindElixirPalette(style);
        expect(style.removeProperty).toHaveBeenCalledTimes(20);
    });

    it('accepts supported text identities and rejects unrelated files', () => {
        expect(isSupportedMindMapImportFile({ name: 'ideas.md', type: '' })).toBe(true);
        expect(isSupportedMindMapImportFile({ name: 'ideas', type: 'text/markdown' })).toBe(true);
        expect(isSupportedMindMapImportFile({ name: 'ideas.OPML', type: 'application/octet-stream' })).toBe(true);
        expect(isSupportedMindMapImportFile({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
    });

    it('parses Markdown and OPML through the validated tree boundary', () => {
        expect(parseMindMapImportText('ideas.md', '# Root\n## Child')).toMatchObject({
            topic: 'Root',
            children: [expect.objectContaining({ topic: 'Child' })],
        });
        expect(parseMindMapImportText('ideas.opml', `<?xml version="1.0"?>
            <opml version="2.0"><body><outline text="Root"><outline text="Child" /></outline></body></opml>`))
            .toMatchObject({ topic: 'Root' });
        expect(() => parseMindMapImportText('ideas.md', new ArrayBuffer(8))).toThrow(
            'Mind map import did not contain text.',
        );
    });

    it('removes the exact arrow listener on toggle and disposal', () => {
        const addListener = vi.fn();
        const removeListener = vi.fn();
        const onEnabledChange = vi.fn();
        const mind = { bus: { addListener, removeListener } } as unknown as MindElixirInstance;
        const controller = createMindElixirArrowModeController({ mind, onEnabledChange });

        controller.toggle();
        expect(controller.isEnabled()).toBe(true);
        const listener = addListener.mock.calls[0]?.[1];
        controller.toggle();
        expect(removeListener).toHaveBeenCalledWith('selectNodes', listener);
        expect(controller.isEnabled()).toBe(false);

        controller.toggle();
        const secondListener = addListener.mock.calls[1]?.[1];
        controller.dispose();
        expect(removeListener).toHaveBeenLastCalledWith('selectNodes', secondListener);
        expect(onEnabledChange).toHaveBeenLastCalledWith(false);
    });

    it('finishes arrow analysis and falls back safely when the provider rejects', async () => {
        let listener: ((nodes: [], element: Topic) => void) | undefined;
        const arrow = { label: '' };
        const emitOperation = vi.fn();
        const logFailure = vi.fn();
        const mind = {
            bus: {
                addListener: (_event: string, next: typeof listener) => { listener = next; },
                removeListener: vi.fn(),
            },
            arrows: [arrow],
            createArrow: vi.fn(),
            renderArrow: vi.fn(),
            getData: () => ({ nodeData: { id: 'root', topic: 'Root', children: [] } }),
            getObjById: (id: string) => ({ id, topic: id === 'left' ? 'Left' : 'Right' }),
        } as unknown as MindElixirInstance;
        const controller = createMindElixirArrowModeController({
            mind,
            onEnabledChange: vi.fn(),
            dependencies: {
                analyzeRelationship: vi.fn().mockRejectedValue(new Error('provider unavailable')),
                emitOperation,
                logFailure,
            },
        });
        const left = { dataset: { nodeid: 'left' } } as unknown as Topic;
        const right = { dataset: { nodeid: 'right' } } as unknown as Topic;

        controller.toggle();
        listener?.([], left);
        listener?.([], right);
        await vi.waitFor(() => expect(arrow.label).toBe('关联'));

        expect(logFailure).toHaveBeenCalledOnce();
        expect(emitOperation).toHaveBeenCalledWith(mind, expect.objectContaining({
            name: 'editArrowLabel',
            obj: arrow,
        }));
        expect(controller.isEnabled()).toBe(false);
    });
});
