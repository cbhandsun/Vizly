import { describe, expect, it } from 'vitest';

import { resolveSmartEdgeHandleSelection } from '../smartEdgeHandleSelection';

const baseInput = {
    rawSourceHandleId: 'source-right',
    rawTargetHandleId: 'target-left',
    manualHandleSides: ['source', 'target'],
    inferredSubDomainHandles: false,
    sourceNode: {
        id: 'source',
        parentId: 'source-container',
        positionAbsolute: { x: 0, y: 0 },
        width: 100,
        height: 80,
    },
    targetNode: {
        id: 'target',
        parentId: 'target-container',
        positionAbsolute: { x: 200, y: 600 },
        width: 100,
        height: 80,
    },
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 600,
    incomingToTarget: 1,
    outgoingFromSource: 1,
} as const;

describe('resolveSmartEdgeHandleSelection', () => {
    it('moves eligible cross-container vertical edges to the outer horizontal side', () => {
        expect(resolveSmartEdgeHandleSelection(baseInput)).toEqual({
            sourceHandleId: 'right',
            targetHandleId: 'right',
        });
    });

    it('preserves explicit handles when manual-side metadata is invalid', () => {
        expect(resolveSmartEdgeHandleSelection({
            ...baseInput,
            manualHandleSides: 'source,target',
        })).toEqual({
            sourceHandleId: 'source-right',
            targetHandleId: 'target-left',
        });
    });

    it('preserves automatic sub-domain fan handles', () => {
        expect(resolveSmartEdgeHandleSelection({
            ...baseInput,
            inferredSubDomainHandles: true,
            incomingToTarget: 2,
        })).toEqual({
            sourceHandleId: 'source-right',
            targetHandleId: 'target-left',
        });
    });

    it('coerces non-finite coordinates before applying geometry rules', () => {
        expect(resolveSmartEdgeHandleSelection({
            ...baseInput,
            sourceNode: undefined,
            targetNode: undefined,
            sourceX: Number.NaN,
            sourceY: Number.NEGATIVE_INFINITY,
            targetX: Number.POSITIVE_INFINITY,
            targetY: Number.NaN,
        })).toEqual({
            sourceHandleId: 'source-right',
            targetHandleId: 'target-left',
        });
    });
});
