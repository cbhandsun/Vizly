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
});
