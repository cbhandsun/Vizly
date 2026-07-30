import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { resolveFlowchartConnectedAddPlan } from '../flowchartConnectedAdd';

const createNode = (
    id: string,
    position: { x: number; y: number },
    options: Partial<Node> = {},
): Node => ({
    id,
    type: 'flowchart',
    position,
    data: {},
    ...options,
});

describe('resolveFlowchartConnectedAddPlan', () => {
    it('places a flowchart node to the right of the single selected source', () => {
        const source = createNode('source', { x: 100, y: 40 }, { selected: true });

        expect(resolveFlowchartConnectedAddPlan([source], 'flowchart')).toEqual({
            sourceNode: source,
            position: { x: 300, y: 40 },
            sourceHandle: 'right',
            targetHandle: 'left',
        });
    });

    it('moves down to avoid occupied placement slots', () => {
        const source = createNode('source', { x: 0, y: 0 }, { selected: true });
        const occupied = createNode('occupied', { x: 200, y: 0 });

        expect(resolveFlowchartConnectedAddPlan(
            [source, occupied],
            'flowchart',
        )?.position).toEqual({ x: 200, y: 120 });
    });

    it.each([
        { nodes: [], type: 'flowchart' },
        {
            nodes: [
                createNode('a', { x: 0, y: 0 }, { selected: true }),
                createNode('b', { x: 200, y: 0 }, { selected: true }),
            ],
            type: 'flowchart',
        },
        {
            nodes: [createNode('group', { x: 0, y: 0 }, {
                type: 'titleGroup',
                selected: true,
            })],
            type: 'flowchart',
        },
        {
            nodes: [createNode('a', { x: 0, y: 0 }, { selected: true })],
            type: 'swimlane',
        },
    ])('falls back to free placement for empty, ambiguous, or non-flow selections', ({ nodes, type }) => {
        expect(resolveFlowchartConnectedAddPlan(nodes, type)).toBeNull();
    });

    it('coerces invalid external coordinates to a safe finite placement', () => {
        const source = createNode('source', {
            x: Number.POSITIVE_INFINITY,
            y: Number.NaN,
        }, { selected: true });

        expect(resolveFlowchartConnectedAddPlan([source], 'flowchart')?.position)
            .toEqual({ x: 200, y: 0 });
    });
});
