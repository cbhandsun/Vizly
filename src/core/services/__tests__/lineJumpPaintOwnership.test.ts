import { describe, expect, it } from 'vitest';
import {
    collectPaintedLineJumpIntersections,
    injectLineJumps,
    LineJumpEngine,
} from '../LineJumpEngine';
import { resolveLineJumpPaintOwnership } from '../lineJumpPaintOwnership';

const owner = {
    edgeId: 'owner',
    points: [{ x: 0, y: 100.5 }, { x: 220, y: 100.5 }],
    endpointInfo: { source: 'hub', target: 'owner-target' },
    paintOwnership: {
        hiddenRanges: [{ from: 0, to: 200, ownerEdgeId: 'owner' }],
    },
};

const member = (edgeId: string) => ({
    edgeId,
    points: [{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 180 }],
    endpointInfo: { source: 'hub', target: `${edgeId}-target` },
    paintOwnership: {
        hiddenRanges: [{ from: 0, to: 200, ownerEdgeId: 'owner' }],
    },
});

const vertical = {
    edgeId: 'vertical',
    points: [{ x: 80, y: 20 }, { x: 80, y: 180 }],
    endpointInfo: { source: 'vertical-source', target: 'vertical-target' },
};

describe('line-jump paint ownership', () => {
    it('moves hidden member crossings to the visible owner and deduplicates coincident members', () => {
        const intersections = collectPaintedLineJumpIntersections([
            owner,
            member('member-a'),
            member('member-b'),
            vertical,
        ]);
        const ownerJumps = intersections.filter(item => item.horizontalEdgeId === 'owner');

        expect(ownerJumps).toEqual([{
            point: { x: 80, y: 100.5 },
            horizontalEdgeId: 'owner',
            verticalEdgeId: 'vertical',
        }]);
        expect(intersections.some(item => item.horizontalEdgeId.startsWith('member-'))).toBe(false);
        expect(injectLineJumps(owner.points, ownerJumps, 6, 0)).toContain('A 6 6');
    });

    it('keeps private, boundary, missing-owner, and ambiguous crossings on their original edge', () => {
        const crossings = [40, 80, 120, 160].map(x => ({
            point: { x, y: 100 },
            horizontalEdgeId: 'member',
            verticalEdgeId: `vertical-${x}`,
        }));
        const memberPath = {
            edgeId: 'member',
            points: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
            paintOwnership: {
                hiddenRanges: [
                    { from: 20, to: 80, ownerEdgeId: 'missing' },
                    { from: 80, to: 160, ownerEdgeId: 'owner' },
                    { from: 80, to: 160, ownerEdgeId: 'second-owner' },
                ],
            },
        };

        expect(resolveLineJumpPaintOwnership(crossings, [memberPath, owner])).toEqual(crossings);
        expect(resolveLineJumpPaintOwnership([], [memberPath])).toEqual([]);
        expect(resolveLineJumpPaintOwnership(crossings, [])).toEqual(crossings);
    });

    it('updates the live engine when shared-trunk ownership changes', () => {
        LineJumpEngine.getInstance().cleanup();
        const engine = LineJumpEngine.getInstance();
        engine.registerEdge(owner.edgeId, owner.points, owner.endpointInfo, owner.paintOwnership);
        engine.registerEdge('member', member('member').points, member('member').endpointInfo, member('member').paintOwnership);
        engine.registerEdge(vertical.edgeId, vertical.points, vertical.endpointInfo);

        expect(engine.getJumpsForEdge('owner')).toHaveLength(1);
        expect(engine.getJumpsForEdge('member')).toEqual([]);

        engine.registerEdge('member', member('member').points, member('member').endpointInfo, { hiddenRanges: [] });
        expect(engine.getJumpsForEdge('member')).toHaveLength(1);
        engine.cleanup();
    });
});
