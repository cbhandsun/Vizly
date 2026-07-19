// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createVisualizerLegendDetails } from '../visualizerLegendModel';
import type { DebugPayload } from '../visualizerModel';

describe('createVisualizerLegendDetails', () => {
    it('normalizes optional routing diagnostics into bounded display values', () => {
        const details = createVisualizerLegendDetails({
            selectedSourcePos: 'bottom',
            selectedTargetPos: 'top',
            metadata: { strategy: 'orthogonal' },
            algorithmDebug: {
                portSelection: {
                    centers: { dx: 10.4, dy: -5.8 },
                    peerGroupMembers: Array.from({ length: 10 }, (_, index) => `edge-${index}`),
                    trunkAxis: 42,
                    trunkVertical: true,
                },
                waypointRefinement: {
                    initial: { totalScore: 12 },
                    final: { totalScore: 7, hardCrossings: 0 },
                    changed: true,
                },
            },
        } as unknown as DebugPayload);

        expect(details).toMatchObject({
            strategy: 'orthogonal',
            source: 'bottom',
            target: 'top',
            deltaX: '10',
            deltaY: '-6',
            trunkAxis: '42',
            trunkOrientation: 'V',
            waypointInitialScore: 12,
            waypointFinalScore: 7,
            waypointChanged: 'moved',
            hasMorePeerGroupMembers: true,
        });
        expect(details.peerGroupMembers.split(',')).toHaveLength(8);
    });

    it('uses safe fallbacks for missing or wrong-shaped debug metadata', () => {
        const details = createVisualizerLegendDetails({ algorithmDebug: 'bad' } as unknown as DebugPayload);

        expect(details.strategy).toBe('Unknown');
        expect(details.source).toBe('?');
        expect(details.visibilityEdgeCount).toBe(0);
        expect(details.waypointInitialScore).toBeNull();
    });
});
