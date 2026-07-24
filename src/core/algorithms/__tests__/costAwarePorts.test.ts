import { describe, expect, it } from 'vitest';
import { Position } from '../../types/flow';
import {
    normalizeLineObstacles,
    normalizeNodeRect,
    normalizeObstacles,
    normalizePortSelectionConfig
} from '../costAwarePortInput';
import { selectOptimalPorts, selectQuickPorts } from '../costAwarePorts';

const DEFAULTS = {
    bonusCostThreshold: -100,
    lowConfidenceThreshold: 0.2,
    highConfidenceThreshold: 0.8,
    preferGeometryOverBus: true,
    enableObstacleAwareness: true,
    portUsageWeight: 50,
    enableDynamicPorts: true,
    portSlidePadding: 12,
    bendPenalty: 50,
    obstaclePenalty: 100,
    crossingPenalty: 1200,
    layoutDirection: 'TB' as const,
    portUsage: {},
    sourceId: '',
    targetId: '',
    returnAllCandidates: false
};

const POSITIONS = [Position.Top, Position.Bottom, Position.Left, Position.Right];

describe('costAwarePorts', () => {
    it('keeps the public quick-selection behavior for horizontal and vertical nodes', () => {
        expect(selectQuickPorts(
            { x: 0, y: 0, width: 100, height: 60 },
            { x: 400, y: 0, width: 100, height: 60 }
        )).toEqual({ sourcePos: Position.Right, targetPos: Position.Left });

        expect(selectQuickPorts(
            { x: 0, y: 0, width: 100, height: 60 },
            { x: 0, y: 400, width: 100, height: 60 }
        )).toEqual({ sourcePos: Position.Bottom, targetPos: Position.Top });
    });

    it('evaluates all port pairs for valid unconstrained input', () => {
        const result = selectOptimalPorts(
            { x: 0, y: 0, width: 100, height: 60 },
            { x: 400, y: 0, width: 100, height: 60 },
            [],
            [],
            { returnAllCandidates: true }
        );

        expect(result.allCandidates).toHaveLength(16);
        expect(POSITIONS).toContain(result.sourcePos);
        expect(POSITIONS).toContain(result.targetPos);
        expect(Number.isFinite(result.estimatedCost)).toBe(true);
        expect(Number.isFinite(result.confidence)).toBe(true);
    });

    it('falls back safely for null nodes, collections, config, and constraints', () => {
        const result = selectOptimalPorts(
            null as never,
            null as never,
            null as never,
            null as never,
            null as never,
            null as never,
            null as never
        );

        expect(POSITIONS).toContain(result.sourcePos);
        expect(POSITIONS).toContain(result.targetPos);
        expect(Number.isFinite(result.estimatedCost)).toBe(true);
        expect(Number.isFinite(result.confidence)).toBe(true);
        expect(POSITIONS).toContain(selectQuickPorts(null as never, null as never).sourcePos);
    });

    it('ignores invalid constrained positions and sanitizes extreme numeric input', () => {
        const result = selectOptimalPorts(
            { x: Number.NEGATIVE_INFINITY, y: 1e100, width: -10, height: Number.NaN } as never,
            { x: 1e100, y: -1e100, width: Number.POSITIVE_INFINITY, height: 1e100 } as never,
            [null, { x: Number.NaN, y: 0, width: 10, height: 10 }] as never,
            [{ start: { x: 0, y: 0 }, end: { x: Number.POSITIVE_INFINITY, y: 0 } }],
            {
                returnAllCandidates: true,
                constrainedSourcePos: 'diagonal',
                constrainedTargetPos: 42,
                bendPenalty: Number.POSITIVE_INFINITY,
                obstaclePenalty: -10,
                crossingPenalty: Number.NaN,
                globalChannelCount: 1e100,
                globalChannelIndex: -100
            } as never
        );

        expect(result.allCandidates).toHaveLength(16);
        expect(Number.isFinite(result.estimatedCost)).toBe(true);
        expect(Number.isFinite(result.confidence)).toBe(true);
    });

    it('isolates failures from a malformed spatial-index implementation', () => {
        const failingIndex = {
            insert: () => undefined,
            remove: () => undefined,
            query: () => { throw new Error('query failed'); },
            queryLine: () => { throw new Error('queryLine failed'); },
            getAll: () => { throw new Error('getAll failed'); },
            clear: () => undefined
        };

        expect(() => selectOptimalPorts(
            { x: 0, y: 0, width: 100, height: 60 },
            { x: 300, y: 0, width: 100, height: 60 },
            failingIndex
        )).not.toThrow();
    });
});

describe('costAwarePortInput', () => {
    it('normalizes rectangles, obstacle collections, and line collections', () => {
        expect(normalizeNodeRect({ x: 1e100, y: -1e100, width: 0, height: -1 })).toEqual({
            x: 10_000_000,
            y: -10_000_000,
            width: 1,
            height: 1
        });
        expect(normalizeObstacles([
            null,
            { x: 0, y: 0, width: 20, height: 10 },
            { x: Number.NaN, y: 0, width: 10, height: 10 }
        ])).toEqual([{ x: 0, y: 0, width: 20, height: 10 }]);
        expect(normalizeLineObstacles([
            { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
            { start: { x: 0, y: 0 }, end: { x: Number.NaN, y: 10 } }
        ])).toEqual([{ start: { x: 0, y: 0 }, end: { x: 10, y: 10 } }]);
    });

    it('uses enum, boolean, and finite-number allowlists for config', () => {
        const config = normalizePortSelectionConfig({
            bendPenalty: Number.POSITIVE_INFINITY,
            obstaclePenalty: -5,
            lowConfidenceThreshold: 4,
            layoutDirection: 'SIDEWAYS',
            enableDynamicPorts: 'yes',
            preferredSourcePort: 'diagonal',
            constrainedTargetPos: Position.Left,
            portUsage: { safe: 2, negative: -5, invalid: Number.NaN }
        }, DEFAULTS);

        expect(config.bendPenalty).toBe(DEFAULTS.bendPenalty);
        expect(config.obstaclePenalty).toBe(0);
        expect(config.lowConfidenceThreshold).toBe(1);
        expect(config.layoutDirection).toBe('TB');
        expect(config.enableDynamicPorts).toBe(true);
        expect(config.preferredSourcePort).toBeUndefined();
        expect(config.constrainedTargetPos).toBe(Position.Left);
        expect(config.portUsage).toEqual({ safe: 2, negative: 0 });
    });
});
