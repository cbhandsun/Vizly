// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import MindElixir, { type MindElixirInstance, type NodeObj, type Topic } from 'mind-elixir';
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
import {
    isSupportedMindMapToolbarImport,
    parseMindMapToolbarImport,
} from '../useMindElixirImportActions';
import { printMindMap } from '../useMindElixirExportActions';
import {
    applyMindMapDirection,
    bindMindMapDirectionHistorySync,
    coerceMindMapBackgroundPattern,
    coerceMindMapDirectionKey,
    coerceMindMapNumberingPreference,
    useMindElixirCanvasPreferences,
} from '../useMindElixirCanvasPreferences';

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

    it('validates toolbar import identities and rejects non-text reader results', () => {
        expect(isSupportedMindMapToolbarImport('JSON', { name: 'map.json', type: '' })).toBe(true);
        expect(isSupportedMindMapToolbarImport('Markdown', { name: 'map.bin', type: 'text/markdown' })).toBe(true);
        expect(isSupportedMindMapToolbarImport('OPML', { name: 'map.zip', type: 'application/zip' })).toBe(false);
        expect(() => parseMindMapToolbarImport('JSON', new ArrayBuffer(4))).toThrow(
            'JSON import did not contain text.',
        );
        expect(parseMindMapToolbarImport('Markdown', '# Root')).toMatchObject({
            kind: 'tree',
            nodeData: expect.objectContaining({ topic: 'Root' }),
        });
    });

    it('scopes print mode and removes it through the fallback cleanup', () => {
        let scheduledCleanup: (() => void) | undefined;
        const print = vi.fn();
        const removeEventListener = vi.fn();
        const cleanup = printMindMap({
            documentRef: document,
            windowRef: {
                addEventListener: vi.fn(),
                removeEventListener,
                print,
            },
            schedule: callback => {
                scheduledCleanup = callback;
                return 1 as unknown as ReturnType<typeof setTimeout>;
            },
            clearSchedule: vi.fn(),
        });

        expect(document.body.classList.contains('vizly-mindmap-print')).toBe(true);
        expect(print).toHaveBeenCalledOnce();
        scheduledCleanup?.();
        expect(document.body.classList.contains('vizly-mindmap-print')).toBe(false);
        expect(removeEventListener).toHaveBeenCalledWith('afterprint', cleanup);
    });

    it('coerces persisted canvas preferences and applies validated directions', () => {
        expect(coerceMindMapBackgroundPattern('grid')).toBe('grid');
        expect(coerceMindMapBackgroundPattern('unsafe-pattern')).toBe('none');
        expect(coerceMindMapDirectionKey('TB')).toBe('L');
        expect(coerceMindMapDirectionKey('diagonal')).toBe('LR');

        const initLeft = vi.fn();
        const initRight = vi.fn();
        const initSide = vi.fn();
        const nodeData = { id: 'root', topic: 'Root', children: [] } as NodeObj;
        const fire = vi.fn();
        const mind = {
            direction: 0,
            initLeft,
            initRight,
            initSide,
            undo: vi.fn(),
            redo: vi.fn(),
            bus: { addListener: vi.fn(), removeListener: vi.fn(), fire },
            getData: () => ({ nodeData }),
        } as unknown as MindElixirInstance;
        const { result } = renderHook(() => useMindElixirCanvasPreferences(mind));

        act(() => result.current.changeDirection('L'));
        expect(initLeft).toHaveBeenCalledOnce();
        expect(result.current.currentDirection).toBe('L');
        expect(localStorage.getItem('vizly_mindmap_dir')).toBe('L');
        expect(fire).not.toHaveBeenCalledWith('operation', expect.anything());

        mind.direction = MindElixir.LEFT;
        act(() => result.current.changeDirection('R'));
        expect(initRight).toHaveBeenCalledOnce();
        expect(result.current.currentDirection).toBe('R');
        expect(localStorage.getItem('vizly_mindmap_dir')).toBe('R');
        expect(fire).toHaveBeenLastCalledWith('operation', {
            name: 'changeDirection',
            obj: nodeData,
        });

        mind.direction = MindElixir.RIGHT;
        act(() => result.current.changeDirection('LR'));
        expect(initSide).toHaveBeenCalledOnce();
        expect(result.current.currentDirection).toBe('LR');
        expect(localStorage.getItem('vizly_mindmap_dir')).toBe('LR');
        expect(fire).toHaveBeenCalledTimes(2);
    });

    it('restores snapshot directions during undo and redo and restores native refresh', () => {
        const listeners = new Map<string, () => void>();
        const addListener = vi.fn((event: string, listener: () => void) => listeners.set(event, listener));
        const removeListener = vi.fn();
        const nodeData = { id: 'root', topic: 'Root', children: [] } as NodeObj;
        const nativeRefresh = vi.fn();
        const nativeUndo = vi.fn(function (this: MindElixirInstance) {
            this.refresh({ nodeData, direction: MindElixir.RIGHT });
        });
        const nativeRedo = vi.fn(function (this: MindElixirInstance) {
            this.refresh({ nodeData, direction: MindElixir.LEFT });
        });
        const mind = {
            direction: MindElixir.LEFT,
            isFocusMode: false,
            refresh: nativeRefresh,
            undo: nativeUndo,
            redo: nativeRedo,
            bus: { addListener, removeListener },
        } as unknown as MindElixirInstance;
        const onDirectionChange = vi.fn();

        const cleanup = bindMindMapDirectionHistorySync(mind, onDirectionChange);
        const wrappedRefresh = mind.refresh;

        mind.undo();
        expect(nativeUndo).toHaveBeenCalledOnce();
        expect(nativeRefresh).toHaveBeenLastCalledWith({ nodeData, direction: MindElixir.RIGHT });
        expect(mind.direction).toBe(MindElixir.RIGHT);
        expect(onDirectionChange).toHaveBeenLastCalledWith('R');

        mind.redo();
        expect(nativeRedo).toHaveBeenCalledOnce();
        expect(mind.direction).toBe(MindElixir.LEFT);
        expect(onDirectionChange).toHaveBeenLastCalledWith('L');

        mind.isFocusMode = true;
        mind.direction = MindElixir.RIGHT;
        listeners.get('changeDirection')?.();
        expect(onDirectionChange).toHaveBeenCalledTimes(2);

        cleanup();
        expect(removeListener).toHaveBeenCalledWith('changeDirection', listeners.get('changeDirection'));
        expect(mind.refresh).toBe(nativeRefresh);
        expect(mind.refresh).not.toBe(wrappedRefresh);
    });

    it('uses the native side command for invalid direction input', () => {
        const initSide = vi.fn();
        const mind = {
            initLeft: vi.fn(),
            initRight: vi.fn(),
            initSide,
        } as unknown as MindElixirInstance;

        expect(applyMindMapDirection(mind, 'diagonal')).toBe('LR');
        expect(initSide).toHaveBeenCalledOnce();
    });

    it('validates, restores, reapplies, and persists the numbering preference', () => {
        localStorage.clear();
        expect(coerceMindMapNumberingPreference(null)).toBe(false);
        expect(coerceMindMapNumberingPreference('true')).toBe(false);
        expect(coerceMindMapNumberingPreference('enabled')).toBe(true);

        const root = document.createElement('div');
        root.id = 'vizly-mind-elixir-root';
        document.body.appendChild(root);
        localStorage.setItem('vizly_mindmap_numbering', 'enabled');
        const createMind = () => ({
            bus: { addListener: vi.fn(), removeListener: vi.fn() },
            undo: vi.fn(),
            redo: vi.fn(),
        }) as unknown as MindElixirInstance;
        const firstMind = createMind();
        const secondMind = createMind();
        const hook = renderHook(
            ({ mind }: { mind: MindElixirInstance | null }) => useMindElixirCanvasPreferences(mind),
            { initialProps: { mind: firstMind as MindElixirInstance | null } },
        );

        expect(hook.result.current.numberingEnabled).toBe(true);
        expect(root.hasAttribute('data-numbering')).toBe(true);

        root.removeAttribute('data-numbering');
        hook.rerender({ mind: secondMind });
        expect(root.hasAttribute('data-numbering')).toBe(true);

        act(() => hook.result.current.toggleNumbering());
        expect(hook.result.current.numberingEnabled).toBe(false);
        expect(root.hasAttribute('data-numbering')).toBe(false);
        expect(localStorage.getItem('vizly_mindmap_numbering')).toBe('disabled');

        hook.unmount();
        root.remove();
        localStorage.clear();
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
