import { describe, expect, it } from 'vitest';
import { isStablePathAttachedToLiveEndpoints } from '../stablePathEndpointAttachment';

const liveNode = (x: number, y: number, width = 220, height = 96) => ({
    internals: { positionAbsolute: { x, y } },
    measured: { width, height },
});

describe('isStablePathAttachedToLiveEndpoints', () => {
    it('accepts worker-distributed ports that remain on both live node sides', () => {
        expect(isStablePathAttachedToLiveEndpoints(
            [{ x: 741, y: 1908 }, { x: 616, y: 1908 }, { x: 645, y: 2212 }],
            741,
            1908,
            748,
            2212,
            'bottom',
            'top',
            true,
            liveNode(631, 1812),
            liveNode(632, 2212),
        )).toBe(true);
    });

    it('rejects the same terminal drift for a path not owned by the canvas router', () => {
        expect(isStablePathAttachedToLiveEndpoints(
            [{ x: 741, y: 1908 }, { x: 645, y: 2212 }],
            741,
            1908,
            748,
            2212,
            'bottom',
            'top',
            false,
            liveNode(631, 1812),
            liveNode(632, 2212),
        )).toBe(false);
    });

    it('rejects stale canvas terminals outside the live node boundary', () => {
        expect(isStablePathAttachedToLiveEndpoints(
            [{ x: 741, y: 1908 }, { x: 420, y: 2212 }],
            741,
            1908,
            748,
            2212,
            'bottom',
            'top',
            true,
            liveNode(631, 1812),
            liveNode(632, 2212),
        )).toBe(false);
    });

    it('falls back to the bounded live-handle tolerance when node geometry is unavailable', () => {
        expect(isStablePathAttachedToLiveEndpoints(
            [{ x: 743, y: 1908 }, { x: 750, y: 2212 }],
            741,
            1908,
            748,
            2212,
            'bottom',
            'top',
            true,
            null,
            undefined,
        )).toBe(true);
    });
});
