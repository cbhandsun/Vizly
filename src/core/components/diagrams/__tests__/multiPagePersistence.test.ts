import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    createMultiPageMetadata,
    parseMultiPageMetadata,
} from '../multiPagePersistence';
import { DEFAULT_LAYOUT_SELECTION } from '../layoutSelectionPersistence';
import { createAutoSavePayload, parseAutoSavePayload } from '../../../utils/autoSaveStorage';

const node = (id: string): Node => ({
    id,
    position: { x: 10, y: 20 },
    data: { label: id },
});

describe('multiPagePersistence', () => {
    it('round-trips pages and replaces the active page with the latest canvas state', () => {
        const metadata = createMultiPageMetadata([
            { id: 'page-1', name: 'Overview', nodes: [node('stale')], edges: [] },
            { id: 'page-2', name: 'Details', nodes: [], edges: [] },
        ], 'page-1', [node('latest')], []);

        expect(parseMultiPageMetadata(metadata)).toEqual({
            version: 1,
            activePageId: 'page-1',
            pages: [
                {
                    id: 'page-1',
                    name: 'Overview',
                    nodes: [node('latest')],
                    edges: [],
                    layoutSelection: DEFAULT_LAYOUT_SELECTION,
                },
                {
                    id: 'page-2',
                    name: 'Details',
                    nodes: [],
                    edges: [],
                    layoutSelection: DEFAULT_LAYOUT_SELECTION,
                },
            ],
        });
    });

    it('round-trips independent layout selections for each page', () => {
        const horizontalSelection = {
            version: 1 as const,
            strategy: 'domain-lanes',
            direction: 'LR' as const,
            nodeLayout: 'horizontal',
        };
        const metadata = createMultiPageMetadata([
            {
                id: 'page-1',
                name: 'Overview',
                nodes: [],
                edges: [],
                layoutSelection: DEFAULT_LAYOUT_SELECTION,
            },
            {
                id: 'page-2',
                name: 'Details',
                nodes: [],
                edges: [],
                layoutSelection: horizontalSelection,
            },
        ], 'page-2', [], []);

        expect(parseMultiPageMetadata(metadata)?.pages.map(page => page.layoutSelection)).toEqual([
            DEFAULT_LAYOUT_SELECTION,
            horizontalSelection,
        ]);
    });

    it('defaults legacy pages without a layout selection and rejects an invalid explicit selection', () => {
        const legacy = parseMultiPageMetadata({
            multiPage: {
                version: 1,
                activePageId: 'page-1',
                pages: [{ id: 'page-1', name: 'Legacy', nodes: [], edges: [] }],
            },
        });
        expect(legacy?.pages[0]?.layoutSelection).toEqual(DEFAULT_LAYOUT_SELECTION);

        expect(parseMultiPageMetadata({
            multiPage: {
                version: 1,
                activePageId: 'page-1',
                pages: [{
                    id: 'page-1',
                    name: 'Unsafe',
                    nodes: [],
                    edges: [],
                    layoutSelection: {
                        version: 1,
                        strategy: 'domain-lanes',
                        direction: 'diagonal',
                        nodeLayout: 'horizontal',
                    },
                }],
            },
        })).toBeNull();
    });

    it('accepts a valid empty active page without discarding populated sibling pages', () => {
        const parsed = parseMultiPageMetadata({
            multiPage: {
                version: 1,
                activePageId: 'page-2',
                pages: [
                    { id: 'page-1', name: 'Page 1', nodes: [node('kept')], edges: [] },
                    { id: 'page-2', name: 'Page 2', nodes: [], edges: [] },
                ],
            },
        });

        expect(parsed?.activePageId).toBe('page-2');
        expect(parsed?.pages[0]?.nodes).toHaveLength(1);
        expect(parsed?.pages[1]?.nodes).toHaveLength(0);
    });

    it('survives the complete autosave sanitize and parse boundary', () => {
        const metadata = createMultiPageMetadata([
            { id: 'page-1', name: 'Page 1', nodes: [node('preserved')], edges: [] },
            { id: 'page-2', name: 'Page 2', nodes: [], edges: [] },
        ], 'page-2', [], []);
        const payload = createAutoSavePayload({
            diagramId: 'diagram-1',
            nodes: [],
            edges: [],
            metadata,
        });
        const reparsed = parseAutoSavePayload(JSON.stringify(payload));

        expect(parseMultiPageMetadata(reparsed?.metadata)).toMatchObject({
            activePageId: 'page-2',
            pages: [
                { id: 'page-1', nodes: [{ id: 'preserved', position: { x: 10, y: 20 } }] },
                { id: 'page-2', nodes: [] },
            ],
        });
    });

    it.each([
        null,
        {},
        { multiPage: { version: 2, activePageId: 'page-1', pages: [] } },
        { multiPage: { version: 1, activePageId: 'missing', pages: [{ id: 'page-1', name: 'Page', nodes: [], edges: [] }] } },
        { multiPage: { version: 1, activePageId: 'page-1', pages: [
            { id: 'page-1', name: 'Page', nodes: [], edges: [] },
            { id: 'page-1', name: 'Duplicate', nodes: [], edges: [] },
        ] } },
        { multiPage: { version: 1, activePageId: 'page-1', pages: [
            { id: 'page-1', name: 'Page', nodes: [], edges: [{ id: 'orphan', source: 'a', target: 'b' }] },
        ] } },
    ])('rejects malformed, inconsistent, or unsafe metadata %#', metadata => {
        expect(parseMultiPageMetadata(metadata)).toBeNull();
    });

    it('repairs duplicate persisted names without dropping existing pages', () => {
        const parsed = parseMultiPageMetadata({
            multiPage: {
                version: 1,
                activePageId: 'page-1',
                pages: [
                    { id: 'page-1', name: 'Page', nodes: [], edges: [] },
                    { id: 'page-2', name: 'Ｐａｇｅ', nodes: [], edges: [] },
                ],
            },
        });

        expect(parsed?.pages.map(page => page.name)).toEqual(['Page', 'Ｐａｇｅ (2)']);
    });

    it('rejects extreme page counts and overlong names', () => {
        const tooManyPages = Array.from({ length: 51 }, (_, index) => ({
            id: `page-${index}`,
            name: `Page ${index}`,
            nodes: [],
            edges: [],
        }));
        expect(parseMultiPageMetadata({
            multiPage: { version: 1, activePageId: 'page-0', pages: tooManyPages },
        })).toBeNull();
        expect(parseMultiPageMetadata({
            multiPage: {
                version: 1,
                activePageId: 'page-1',
                pages: [{ id: 'page-1', name: 'x'.repeat(81), nodes: [], edges: [] }],
            },
        })).toBeNull();
    });
});
