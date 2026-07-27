import { describe, expect, it } from 'vitest';

import {
    resolveNavigatorNodeLabel,
    resolveNavigatorNodeTypeLabelKey,
    resolveNavigatorSearchText,
} from '../navigatorNodePresentation';

describe('navigator node presentation', () => {
    it('prefers a trimmed user-facing label', () => {
        expect(resolveNavigatorNodeLabel({
            id: 'internal-node-id',
            type: 'custom',
            data: { label: '  物流订单中心  ' },
        })).toBe('物流订单中心');
    });

    it('uses the visible group description instead of exposing an internal id', () => {
        expect(resolveNavigatorNodeLabel({
            id: 'titlegroup-logistics',
            type: 'titleGroup',
            data: { description: ' logistics ' },
        })).toBe('LOGISTICS');
    });

    it('falls back safely for empty and malformed node data', () => {
        expect(resolveNavigatorNodeLabel({
            id: 'node-1',
            type: 'custom',
            data: null,
        })).toBe('node-1');
        expect(resolveNavigatorNodeLabel({
            id: '',
            type: 'custom',
            data: { label: 42 },
        })).toBe('Untitled');
    });

    it('searches visible labels and safe group metadata', () => {
        const searchText = resolveNavigatorSearchText({
            id: 'titlegroup-logistics',
            type: 'titleGroup',
            data: { description: 'Logistics', domain: 'supply-chain' },
        });

        expect(searchText).toContain('logistics');
        expect(searchText).toContain('supply-chain');
        expect(searchText).toContain('titlegroup-logistics');
    });

    it('maps technical node types to localized sidebar label keys', () => {
        expect(resolveNavigatorNodeTypeLabelKey('titleGroup')).toBe('domainGroup');
        expect(resolveNavigatorNodeTypeLabelKey('subGroup')).toBe('subGroup');
        expect(resolveNavigatorNodeTypeLabelKey('stickyNote')).toBe('note');
        expect(resolveNavigatorNodeTypeLabelKey('custom')).toBe('customNode');
        expect(resolveNavigatorNodeTypeLabelKey(undefined)).toBe('customNode');
    });
});
