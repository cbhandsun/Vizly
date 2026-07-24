import { describe, expect, it } from 'vitest';

import {
    buildEdgeRoutingFailureFallback,
    EDGE_ROUTING_BATCH_FAILURE_MESSAGE,
} from '../edgeRoutingFailureFallback';

describe('buildEdgeRoutingFailureFallback', () => {
    it('builds a straight fallback path from valid finite coordinates', () => {
        const result = buildEdgeRoutingFailureFallback('edge-1', {
            jobId: 'job-1',
            sourceX: -10,
            sourceY: 20,
            targetX: 30,
            targetY: 40,
        });

        expect(result).toEqual({
            jobId: 'job-1',
            edgeId: 'edge-1',
            path: 'M -10 20 L 30 40',
            points: [{ x: -10, y: 20 }, { x: 30, y: 40 }],
            labelX: 10,
            labelY: 30,
            error: EDGE_ROUTING_BATCH_FAILURE_MESSAGE,
        });
    });

    it.each([
        ['missing job', undefined],
        ['empty job', {}],
        ['non-finite and mistyped coordinates', {
            jobId: 42,
            sourceX: Number.NaN,
            sourceY: Number.POSITIVE_INFINITY,
            targetX: '30',
            targetY: null,
        }],
    ])('coerces unsafe input for %s', (_name, job) => {
        const result = buildEdgeRoutingFailureFallback('edge-safe', job);

        expect(result.jobId).toBe('edge-safe');
        expect(result.path).toBe('M 0 0 L 0 0');
        expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
        expect(result.labelX).toBe(0);
        expect(result.labelY).toBe(0);
    });

    it('exposes a stable public failure message', () => {
        const result = buildEdgeRoutingFailureFallback('edge-safe', { jobId: 'job-safe' });

        expect(result.error).toBe(EDGE_ROUTING_BATCH_FAILURE_MESSAGE);
    });
});
