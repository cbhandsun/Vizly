/** @vitest-environment jsdom */
import type { Connection, Edge, Node } from '@xyflow/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useConnectionValidation } from '../useConnectionValidation';
import { validateConnectionDetailed } from '../connectionValidationPolicy';
import type { DiagramTypePlugin, PluginContext } from '../../../../types/plugin';
import type { DiagramConnectionPolicy } from '../../../../types/connection';

type TestConnection = Connection & {
    data?: Record<string, string>;
};

const node = (id: string, data: Node['data'] = {}, overrides: Partial<Node> = {}): Node => ({
    id,
    position: { x: 0, y: 0 },
    data,
    ...overrides,
});

const edge = (
    id: string,
    source: string,
    target: string,
    overrides: Partial<Edge> = {},
): Edge => ({
    id,
    source,
    target,
    ...overrides,
});

const connection = (overrides: Partial<TestConnection>): TestConnection => ({
    source: 'source',
    target: 'target',
    sourceHandle: null,
    targetHandle: null,
    ...overrides,
});

describe('useConnectionValidation', () => {
    const nodes = [node('source'), node('target')];

    it('keeps exact duplicate source/target/handle/relation connections invalid', () => {
        const { result } = renderHook(() => useConnectionValidation(nodes, [
            edge('existing', 'source', 'target', {
                sourceHandle: 'out-a',
                targetHandle: 'in-a',
                data: { relationKey: 'success' },
            }),
        ]));

        expect(result.current.isValidConnection(connection({
            sourceHandle: 'out-a',
            targetHandle: 'in-a',
            data: { relationKey: 'success' },
        }))).toBe(false);
        expect(result.current.validateConnection(connection({
            sourceHandle: 'out-a',
            targetHandle: 'in-a',
            data: { relationKey: 'success' },
        })).code).toBe('duplicate-connection');
    });

    it('allows parallel connections between the same nodes when handles differ', () => {
        const { result } = renderHook(() => useConnectionValidation(nodes, [
            edge('existing', 'source', 'target', {
                sourceHandle: 'out-a',
                targetHandle: 'in-a',
            }),
        ]));

        expect(result.current.isValidConnection(connection({
            sourceHandle: 'out-b',
            targetHandle: 'in-b',
        }))).toBe(true);
    });

    it('allows parallel connections between the same handles when relation keys differ', () => {
        const { result } = renderHook(() => useConnectionValidation(nodes, [
            edge('existing', 'source', 'target', {
                sourceHandle: 'out',
                targetHandle: 'in',
                data: { relationKey: 'success' },
            }),
        ]));

        expect(result.current.isValidConnection(connection({
            sourceHandle: 'out',
            targetHandle: 'in',
            data: { relationKey: 'failure' },
        }))).toBe(true);
    });

    it('keeps self-loops disabled by default and enables them through diagram policy', () => {
        const loop = connection({ source: 'source', target: 'source' });
        const defaultHook = renderHook(() => useConnectionValidation(nodes, []));
        expect(defaultHook.result.current.isValidConnection(loop)).toBe(false);
        expect(defaultHook.result.current.validateConnection(loop).code).toBe('self-loop-disabled');

        const plugin = {
            connectionPolicy: { allowSelfLoop: true },
        } as DiagramTypePlugin;
        const pluginContext = {} as PluginContext;
        const policyHook = renderHook(() => useConnectionValidation(
            nodes,
            [],
            pluginContext,
            plugin,
        ));
        expect(policyHook.result.current.isValidConnection(loop)).toBe(true);
    });

    it('still blocks outgoing connections from terminal pill nodes', () => {
        const { result } = renderHook(() => useConnectionValidation([
            node('source', { shape: 'pill', label: 'End' }),
            node('target'),
        ], []));

        expect(result.current.isValidConnection(connection({}))).toBe(false);
        expect(result.current.validateConnection(connection({})).code).toBe('terminal-node-source');
    });

    it('rejects connections whose endpoints are not present in the current graph', () => {
        const { result } = renderHook(() => useConnectionValidation(nodes, []));

        expect(result.current.validateConnection(connection({ source: 'missing-source' })).code)
            .toBe('unknown-source-node');
        expect(result.current.validateConnection(connection({ target: 'missing-target' })).code)
            .toBe('unknown-target-node');
    });
});

describe('validateConnectionDetailed semantic contracts', () => {
    const semanticNodes = [
        node('source', {}, { type: 'producer' }),
        node('target', {}, { type: 'consumer' }),
    ];
    const policy: DiagramConnectionPolicy = {
        portDefinitions: {
            producer: [
                { id: 'out-data', direction: 'source', role: 'output', dataType: 'Order', capacity: 1, relations: ['data'] },
                { id: 'in-control', direction: 'target', role: 'input', dataType: 'Control' },
                { id: 'loop', direction: 'both', role: 'feedback', dataType: 'Signal', relations: ['feedback'] },
            ],
            consumer: [
                { id: 'in-data', direction: 'target', role: 'input', accepts: ['Order'], relations: ['data'] },
                { id: 'out-data', direction: 'source', role: 'output', dataType: 'Order' },
            ],
        },
        relationDefinitions: [
            { key: 'data', sourceRoles: ['output'], targetRoles: ['input'], sourceDataTypes: ['Order'] },
            { key: 'feedback', allowSelfLoop: true },
        ],
    };

    const validate = (
        candidate: Partial<TestConnection>,
        overrides: Partial<Parameters<typeof validateConnectionDetailed>[0]> = {},
    ) => validateConnectionDetailed({
        nodes: semanticNodes,
        edges: [],
        connection: connection({
            sourceHandle: 'out-data',
            targetHandle: 'in-data',
            data: { relationKey: 'data' },
            ...candidate,
        }),
        connectionPolicy: policy,
        ...overrides,
    });

    it('accepts compatible semantic ports and returns a structured valid result', () => {
        expect(validate({})).toMatchObject({ valid: true, code: 'valid' });
    });

    it('rejects missing or unknown semantic ports with actionable codes', () => {
        expect(validate({ sourceHandle: null }).code).toBe('missing-source-port');
        expect(validate({ sourceHandle: 'missing' }).code).toBe('unknown-source-port');
        expect(validate({ targetHandle: 'missing' }).code).toBe('unknown-target-port');
    });

    it('enforces semantic port direction and capacity separately from mutation locks', () => {
        expect(validate({ sourceHandle: 'in-control' }).code).toBe('source-port-direction');
        expect(validate({}, {
            edges: [edge('existing', 'source', 'target', { sourceHandle: 'out-data', targetHandle: 'in-data' })],
        }).code).toBe('source-port-capacity');
    });

    it('ignores the replaced edge during reconnect validation without ignoring other capacity users', () => {
        const oldEdge = edge('old-edge', 'source', 'target', {
            sourceHandle: 'out-data',
            targetHandle: 'in-data',
            data: { relationKey: 'data' },
        });
        const validateReconnect = (edges: Edge[]) => validateConnectionDetailed({
            nodes: semanticNodes,
            edges,
            connection: oldEdge,
            connectionPolicy: policy,
            ignoredEdgeIds: new Set(['old-edge']),
        });
        expect(validateReconnect([oldEdge])).toMatchObject({ valid: true, code: 'valid' });
        expect(validateReconnect([
            oldEdge,
            edge('other-edge', 'source', 'target', {
                sourceHandle: 'out-data',
                targetHandle: 'in-other',
                data: { relationKey: 'data' },
            }),
        ]).code).toBe('source-port-capacity');
    });

    it('rejects incompatible port types and relation contracts', () => {
        expect(validate({ targetHandle: 'out-data' }).code).toBe('target-port-direction');
        expect(validate({ data: { relationKey: 'missing' } }).code).toBe('unknown-relation');
        expect(validate({ sourceHandle: 'out-data', targetHandle: 'in-data', data: { relationKey: 'feedback' } }).code)
            .toBe('source-port-relation');
    });

    it('allows relation-level self-loop overrides without opening every relation', () => {
        expect(validate({ source: 'source', target: 'source', data: { relationKey: 'data' } }).code)
            .toBe('self-loop-disabled');
        expect(validate({
            source: 'source',
            target: 'source',
            sourceHandle: 'loop',
            targetHandle: 'loop',
            data: { relationKey: 'feedback' },
        }).valid).toBe(true);
    });
});
