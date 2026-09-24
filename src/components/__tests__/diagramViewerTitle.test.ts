import { describe, expect, it } from 'vitest';

import {
    getPersistedDiagramTitle,
    normalizeDiagramTitle,
    resolveDiagramViewerTitle,
} from '../diagramViewerTitle';

describe('getPersistedDiagramTitle', () => {
    it('prefers a normalized metadata title', () => {
        expect(getPersistedDiagramTitle({
            name: 'Fallback',
            metadata: { title: '  Order   approval\nflow  ' },
        })).toBe('Order approval flow');
    });

    it('falls back to a normalized diagram name', () => {
        expect(getPersistedDiagramTitle({
            name: '  Sales\u0000flow  ',
            metadata: { title: '' },
        })).toBe('Sales flow');
    });

    it('rejects empty and invalid external values', () => {
        expect(getPersistedDiagramTitle(null)).toBeUndefined();
        expect(getPersistedDiagramTitle({ name: 42, metadata: 'invalid' })).toBeUndefined();
    });

    it('bounds oversized titles', () => {
        expect(getPersistedDiagramTitle({
            metadata: { title: 'x'.repeat(400) },
        })).toHaveLength(240);
    });

    it('normalizes rename input before persistence', () => {
        expect(normalizeDiagramTitle('  New\u0000 name\n ')).toBe('New name');
        expect(normalizeDiagramTitle('   ')).toBeUndefined();
        expect(normalizeDiagramTitle(42)).toBeUndefined();
        expect(normalizeDiagramTitle('x'.repeat(400))).toHaveLength(240);
    });
});

describe('resolveDiagramViewerTitle', () => {
    const translate = (key: string, fallback?: string) => fallback ?? `translated:${key}`;

    it('uses localized standard-preset metadata instead of an untitled fallback', () => {
        expect(resolveDiagramViewerTitle({
            selectedDiagramId: 'logistics-architecture-v1',
            translate,
        })).toBe('Logistics Architecture');
    });

    it('preserves explicit and persisted title priority', () => {
        expect(resolveDiagramViewerTitle({
            selectedDiagramId: 'logistics-architecture-v1',
            selectedDiagram: { titleKey: 'diagram.customTitle', name: 'Fallback name' },
            translate,
        })).toBe('translated:diagram.customTitle');

        expect(resolveDiagramViewerTitle({
            selectedDiagramId: 'custom-diagram',
            loadedDiagram: { diagramId: 'custom-diagram', name: 'Saved diagram' },
            translate,
        })).toBe('Saved diagram');
    });

    it('falls back safely for unknown, empty, and stale metadata', () => {
        expect(resolveDiagramViewerTitle({
            selectedDiagramId: 'unknown-diagram',
            loadedDiagram: { diagramId: 'different-diagram', name: 'Stale title' },
            translate,
        })).toBe('translated:workspace.untitledDiagram');
    });
});
