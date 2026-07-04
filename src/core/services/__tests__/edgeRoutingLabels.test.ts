import { describe, expect, it } from 'vitest';

import { buildRoutedLabelObstacle, getGraphEdgeLabelText } from '../edgeRoutingLabels';

describe('edgeRoutingLabels', () => {
    it('extracts and sanitizes edge labels from top-level or nested data fields', () => {
        expect(
            getGraphEdgeLabelText('edge-1', {
                edges: [{ id: 'edge-1', label: '  <b>Hello</b> world  ' }],
            } as any)
        ).toBe('Hello world');

        expect(
            getGraphEdgeLabelText('edge-2', {
                edges: [{ id: 'edge-2', data: { label: '<i>Status</i>' } }],
            } as any)
        ).toBe('Status');
    });

    it('returns an empty label for missing or non-string edge labels', () => {
        expect(getGraphEdgeLabelText('missing', { edges: [] } as any)).toBe('');
        expect(
            getGraphEdgeLabelText('edge-3', {
                edges: [{ id: 'edge-3', label: 42 }],
            } as any)
        ).toBe('');
    });

    it('builds a centered routed label obstacle with bounded width', () => {
        expect(
            buildRoutedLabelObstacle('edge-1', 'Label', {
                labelX: 100,
                labelY: 200,
            } as any)
        ).toEqual({
            edgeId: 'edge-1',
            ownerId: 'edge-1',
            x: 69,
            y: 187,
            width: 62,
            height: 26,
        });

        expect(
            buildRoutedLabelObstacle('edge-2', 'x'.repeat(100), {
                labelX: 50,
                labelY: 80,
            } as any)
        ).toMatchObject({
            width: 220,
            height: 26,
        });
    });

    it('returns null for empty labels or invalid coordinates', () => {
        expect(
            buildRoutedLabelObstacle('edge-1', '', {
                labelX: 100,
                labelY: 100,
            } as any)
        ).toBeNull();

        expect(
            buildRoutedLabelObstacle('edge-1', 'Label', {
                labelX: Number.NaN,
                labelY: 100,
            } as any)
        ).toBeNull();
    });
});
