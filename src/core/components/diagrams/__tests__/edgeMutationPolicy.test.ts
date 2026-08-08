import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    applyEdgeLockState,
    canReconnectEdge,
    hasMutationLockedEdge,
    isEdgeMutationLocked,
    isEdgeUserLocked,
    resolveTargetEdges,
} from '../edgeMutationPolicy';

const edge = (id: string, overrides: Partial<Edge> = {}): Edge => ({
    id,
    source: 'source',
    target: 'target',
    ...overrides,
});

describe('edge mutation policy', () => {
    it('recognizes user, provider, and non-deletable connector locks', () => {
        expect(isEdgeMutationLocked(edge('user', { data: { locked: true } }))).toBe(true);
        expect(isEdgeMutationLocked(edge('provider', { data: { isLocked: true } }))).toBe(true);
        expect(isEdgeMutationLocked(edge('system', { deletable: false }))).toBe(true);
        expect(isEdgeMutationLocked(edge('editable'))).toBe(false);
        expect(isEdgeMutationLocked(edge('invalid-data', { data: 'unsafe' as never }))).toBe(false);
        expect(hasMutationLockedEdge([edge('editable'), edge('locked', { data: { locked: true } })])).toBe(true);
        expect(canReconnectEdge(edge('editable'))).toBe(true);
        expect(canReconnectEdge(edge('locked', { data: { locked: true } }))).toBe(false);
    });

    it('locks and unlocks user-controlled edges without mutating unrelated connectors', () => {
        const untouched = edge('untouched');
        const initial = [edge('target'), untouched];
        const locked = applyEdgeLockState(initial, new Set(['target', '', 'missing']), true);

        expect(locked.changed).toBe(true);
        expect(locked.edges[0]).toMatchObject({
            deletable: false,
            reconnectable: false,
            data: { locked: true },
        });
        expect(locked.edges[1]).toBe(untouched);
        expect(isEdgeUserLocked(locked.edges[0])).toBe(true);

        const unlocked = applyEdgeLockState(locked.edges, new Set(['target']), false);
        expect(unlocked.edges[0]).toMatchObject({
            deletable: true,
            reconnectable: true,
            data: { locked: false },
        });
    });

    it('does not override provider or system-owned locks', () => {
        const providerLocked = edge('provider', { data: { isLocked: true } });
        const systemLocked = edge('system', { deletable: false });
        const result = applyEdgeLockState(
            [providerLocked, systemLocked],
            new Set(['provider', 'system']),
            false,
        );

        expect(result.changed).toBe(false);
        expect(result.edges).toEqual([providerLocked, systemLocked]);
        expect(resolveTargetEdges(result.edges, new Set(['system']))).toEqual([systemLocked]);
    });
});
