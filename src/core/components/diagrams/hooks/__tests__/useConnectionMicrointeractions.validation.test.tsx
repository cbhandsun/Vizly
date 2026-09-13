// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Connection, Edge } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useConnectionMicrointeractions } from '../useConnectionMicrointeractions';
import type { ConnectionValidationResult } from '../../../../types/connection';

const invalidResult: ConnectionValidationResult = {
    valid: false,
    code: 'source-port-capacity',
    severity: 'error',
    message: 'Source port reached capacity.',
};

describe('useConnectionMicrointeractions connection validation feedback', () => {
    it('blocks invalid connection-end candidates and exposes the structured reason', () => {
        const onConnect = vi.fn();
        const onConnectEnd = vi.fn();
        const setEdges = vi.fn();
        const validateConnection = vi.fn((_connection: Connection): ConnectionValidationResult => invalidResult);

        const { result } = renderHook(() => useConnectionMicrointeractions({
            nodes: [],
            setEdges,
            onConnect,
            onConnectEnd,
            validateConnection,
            reactFlowInstance: null,
        }));

        act(() => {
            result.current.onConnectStart({} as never, { nodeId: 'source', handleId: 'out', handleType: 'source' });
        });
        act(() => {
            result.current.enhancedOnConnectEnd({} as never, {
                isValid: false,
                fromNode: { id: 'source' },
                toNode: { id: 'target' },
                fromHandle: { id: 'out' },
                toHandle: { id: 'in' },
            } as never);
        });

        expect(validateConnection).toHaveBeenCalledWith({
            source: 'source',
            target: 'target',
            sourceHandle: 'out',
            targetHandle: 'in',
        });
        expect(onConnect).not.toHaveBeenCalled();
        expect(onConnectEnd).toHaveBeenCalledOnce();
        expect(result.current.lastConnectionValidation).toEqual(invalidResult);
    });

    it('revalidates the final onConnect write path before mutating edges', () => {
        const onConnect = vi.fn();
        const setEdges = vi.fn();
        const validateConnection = vi.fn((_connection: Connection): ConnectionValidationResult => invalidResult);

        const { result } = renderHook(() => useConnectionMicrointeractions({
            nodes: [],
            setEdges,
            onConnect,
            validateConnection,
            reactFlowInstance: null,
        }));

        const connection: Connection = {
            source: 'source',
            target: 'target',
            sourceHandle: 'out',
            targetHandle: 'in',
        };
        act(() => {
            result.current.enhancedOnConnect(connection);
        });

        expect(validateConnection).toHaveBeenCalledWith(connection);
        expect(onConnect).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
        expect(result.current.lastConnectionValidation).toEqual(invalidResult);
    });

    it('clears the previous validation reason when a new connection starts or succeeds', () => {
        const edge: Edge = { id: 'edge-1', source: 'source', target: 'target' };
        const setEdges = vi.fn((updater: SetStateAction<Edge[]>) => (
            typeof updater === 'function' ? updater([edge]) : updater
        ));
        const { result } = renderHook(() => useConnectionMicrointeractions({
            nodes: [],
            setEdges,
            onConnect: vi.fn(),
            validateConnection: () => invalidResult,
            reactFlowInstance: null,
        }));

        act(() => {
            result.current.enhancedOnConnectEnd({} as never, {
                isValid: false,
                fromNode: { id: 'source' },
                toNode: { id: 'target' },
                fromHandle: { id: 'out' },
                toHandle: { id: 'in' },
            } as never);
        });
        expect(result.current.lastConnectionValidation).toEqual(invalidResult);

        act(() => {
            result.current.onConnectStart({} as never, { nodeId: 'source', handleId: 'out', handleType: 'source' });
        });
        expect(result.current.lastConnectionValidation).toBeNull();
    });

    it('auto-dismisses stale validation feedback after a short delay', () => {
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useConnectionMicrointeractions({
                nodes: [],
                setEdges: vi.fn(),
                onConnect: vi.fn(),
                validateConnection: () => invalidResult,
                reactFlowInstance: null,
            }));

            act(() => {
                result.current.enhancedOnConnectEnd({} as never, {
                    isValid: false,
                    fromNode: { id: 'source' },
                    toNode: { id: 'target' },
                    fromHandle: { id: 'out' },
                    toHandle: { id: 'in' },
                } as never);
            });
            expect(result.current.lastConnectionValidation).toEqual(invalidResult);

            act(() => {
                vi.advanceTimersByTime(4_499);
            });
            expect(result.current.lastConnectionValidation).toEqual(invalidResult);

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(result.current.lastConnectionValidation).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('shares validation feedback for reconnect rejections and auto-dismisses it', () => {
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useConnectionMicrointeractions({
                nodes: [],
                setEdges: vi.fn(),
                onConnect: vi.fn(),
                reactFlowInstance: null,
            }));

            act(() => {
                result.current.setConnectionValidationFeedback(invalidResult);
            });
            expect(result.current.lastConnectionValidation).toEqual(invalidResult);

            act(() => {
                vi.advanceTimersByTime(4_500);
            });
            expect(result.current.lastConnectionValidation).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });
});
