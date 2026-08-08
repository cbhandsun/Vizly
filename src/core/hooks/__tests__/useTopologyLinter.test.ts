import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    DEFAULT_TOPOLOGY_LINT_RULES,
    lintTopology,
    type LintRule,
} from '../useTopologyLinter';

const architectureNode = (id: string, type: string): Node => ({
    id,
    type: 'architectureNode',
    position: { x: 0, y: 0 },
    data: { label: id, type },
});

describe('lintTopology', () => {
    it('keeps an empty diagram neutral instead of claiming compliance', () => {
        const result = lintTopology([], []);

        expect(result.violations).toEqual([]);
        expect(result.lintedNodes).toEqual([]);
        expect(result.lintedEdges).toEqual([]);
    });

    it('reports an isolated architecture component even when the diagram has no edges', () => {
        const result = lintTopology([architectureNode('client', 'frontend')], []);

        expect(result.violations).toEqual([
            expect.objectContaining({
                ruleId: 'ISO-001',
                severity: 'info',
                sourceId: 'client',
                targetId: '',
                edgeId: '',
                messageKey: 'designer.architecture.validation.rules.iso001',
            }),
        ]);
        expect(result.lintedNodes[0]?.data.linterErrors).toEqual([
            expect.stringContaining('[ISO-001]'),
        ]);
    });

    it('reports network containment and isolation independently for an unparented network node', () => {
        const networkNode: Node = {
            id: 'public-endpoint',
            type: 'networkNode',
            position: { x: 0, y: 0 },
            data: { label: 'Public endpoint', type: 'public' },
        };

        const result = lintTopology([networkNode], []);

        expect(result.violations.map(violation => violation.ruleId)).toEqual([
            'NET-001',
            'ISO-001',
        ]);
    });

    it('marks a direct client-to-database connection as an error', () => {
        const edge: Edge = { id: 'direct-db', source: 'client', target: 'database' };
        const result = lintTopology([
            architectureNode('client', 'frontend'),
            architectureNode('database', 'database'),
        ], [edge]);

        expect(result.violations).toEqual([
            expect.objectContaining({
                ruleId: 'SEC-001',
                severity: 'error',
                edgeId: 'direct-db',
                sourceId: 'client',
                targetId: 'database',
            }),
        ]);
        expect(result.lintedEdges[0]).toEqual(expect.objectContaining({
            animated: true,
            zIndex: 9999,
            style: expect.objectContaining({ stroke: '#f5222d' }),
        }));
    });

    it('accepts a safe gateway-to-service connection without issues', () => {
        const result = lintTopology([
            architectureNode('gateway', 'gateway'),
            architectureNode('service', 'microservice'),
        ], [{ id: 'safe-edge', source: 'gateway', target: 'service' }]);

        expect(result.violations).toEqual([]);
    });

    it('supports explicit custom rules without weakening the default rule contract', () => {
        const customRule: LintRule = {
            id: 'CUSTOM-001',
            severity: 'warning',
            message: 'Review this dependency.',
            sourceTypes: ['component'],
            targetTypes: ['system'],
        };
        const result = lintTopology([
            architectureNode('component', 'component'),
            architectureNode('system', 'system'),
        ], [{ id: 'custom-edge', source: 'component', target: 'system' }], [
            ...DEFAULT_TOPOLOGY_LINT_RULES,
            customRule,
        ]);

        expect(result.violations).toEqual([
            expect.objectContaining({ ruleId: 'CUSTOM-001', message: 'Review this dependency.' }),
        ]);
    });

    it('returns no findings or visual mutations when validation is disabled', () => {
        const node = architectureNode('client', 'frontend');
        const result = lintTopology([node], [], DEFAULT_TOPOLOGY_LINT_RULES, false);

        expect(result.violations).toEqual([]);
        expect(result.lintedNodes).toEqual([node]);
    });
});
