import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    createMultiPageMetadata,
    parseMultiPageMetadata,
} from '../multiPagePersistence';
import { DEFAULT_LAYOUT_SELECTION, parseLayoutSelection } from '../layoutSelectionPersistence';
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
            version: 2 as const,
            strategy: 'domain-lanes',
            direction: 'LR' as const,
            nodeLayout: 'horizontal',
            laneRankPreference: 'compact' as const,
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

    it('migrates v1 selections to unknown auto mode without guessing a historic applied mode', () => {
        expect(parseLayoutSelection({
            version: 1,
            strategy: 'domain-dagre',
            direction: 'TB',
            nodeLayout: 'dagre',
        })).toEqual({
            version: 2,
            strategy: 'domain-dagre',
            direction: 'TB',
            nodeLayout: 'dagre',
            laneRankPreference: 'auto',
        });
    });

    it('accepts a bounded routed-quality lane decision', () => {
        const metric = { flowLength: 500, whitespaceRatio: 0.5, backwardTravel: 0, backwardEdgeCount: 0 };
        expect(parseLayoutSelection({
            version: 2,
            strategy: 'domain-dagre',
            direction: 'TB',
            nodeLayout: 'dagre',
            laneRankPreference: 'auto',
            laneRankDecision: {
                version: 1, policyVersion: 1, requested: 'auto', applied: 'compact',
                reason: 'routed-quality', direction: 'TB', connectedInputFingerprint: 'safe',
                metrics: { global: metric, compact: metric }, previousApplied: 'global',
            },
        })?.laneRankDecision).toMatchObject({
            requested: 'auto', applied: 'compact', reason: 'routed-quality', previousApplied: 'global',
        });
    });

    it.each([
        { laneRankPreference: 'diagonal' },
        { laneRankDecision: { version: 2 } },
        { laneRankDecision: { version: 1, policyVersion: 1, requested: 'auto', applied: 'global', reason: 'compact-benefit', direction: 'TB', connectedInputFingerprint: 'x'.repeat(257), metrics: { global: { flowLength: 1, whitespaceRatio: 0, backwardTravel: 0, backwardEdgeCount: 0 } } } },
        { laneRankDecision: { version: 1, policyVersion: 1, requested: 'compact', applied: 'global', reason: 'compact-benefit', direction: 'TB', connectedInputFingerprint: 'safe', metrics: { global: { flowLength: Infinity, whitespaceRatio: 0, backwardTravel: 0, backwardEdgeCount: 0 } } } },
        { laneRankDecision: { version: 1, policyVersion: 1, requested: 'auto', applied: 'global', reason: 'untrusted user text', direction: 'TB', connectedInputFingerprint: 'safe', metrics: { global: { flowLength: 1, whitespaceRatio: 1.1, backwardTravel: 0, backwardEdgeCount: 0 } } } },
    ])('keeps a valid v2 selection but drops unsafe optional decision %#', patch => {
        const parsed = parseLayoutSelection({
            version: 2, strategy: 'domain-dagre', direction: 'TB', nodeLayout: 'dagre',
            laneRankPreference: 'auto', ...patch,
        });
        if ('laneRankPreference' in patch) expect(parsed).toBeNull();
        else expect(parsed).toEqual({
            version: 2, strategy: 'domain-dagre', direction: 'TB', nodeLayout: 'dagre',
            laneRankPreference: 'auto',
        });
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
