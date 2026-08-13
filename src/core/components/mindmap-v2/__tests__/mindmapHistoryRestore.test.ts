import { describe, expect, it, vi } from 'vitest';
import type { NodeObj } from 'mind-elixir';

import { restoreMindMapHistoryRecord } from '../mindmapHistoryRestore';

const createMind = ({
    nodeData = { id: 'root', topic: 'Current', children: [] } as NodeObj,
    fireError,
    busAvailable = true,
}: {
    nodeData?: NodeObj;
    fireError?: Error;
    busAvailable?: boolean;
} = {}) => {
    const refresh = vi.fn((_data: { nodeData: NodeObj; direction: number }): void => {});
    const fire = vi.fn((_event: string, _operation: unknown): void => {
        if (fireError) throw fireError;
    });
    const bus: unknown = busAvailable ? { fire } : {};

    return {
        mind: {
            getData: vi.fn(() => ({ nodeData, direction: 2 })),
            refresh,
            toCenter: vi.fn(),
            bus,
        },
        fire,
        refresh,
    };
};

describe('mind map history restore transaction', () => {
    it('records a recovery snapshot before applying a sanitized historical version', () => {
        const currentNode = { id: 'root', topic: 'Current', children: [] } as NodeObj;
        const { mind, fire, refresh } = createMind({ nodeData: currentNode });
        const recordHistory = vi.fn();

        restoreMindMapHistoryRecord({
            mind,
            record: {
                id: 'snapshot-1',
                time: '10:30:00',
                description: 'Earlier state',
                data: JSON.stringify({
                    id: 'root',
                    topic: 'Earlier',
                    children: [{ id: '<bad>', topic: 'Child', hyperLink: 'javascript:alert(1)' }],
                }),
            },
            backupDescription: 'Recovery snapshot before version restore',
            dependencies: { recordHistory },
        });

        expect(recordHistory.mock.invocationCallOrder[0]).toBeLessThan(
            refresh.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
        );
        expect(recordHistory).toHaveBeenCalledWith(
            'Recovery snapshot before version restore',
            expect.objectContaining({ topic: 'Current' }),
        );
        const restoredData = refresh.mock.calls[0]?.[0];
        const restoredChild = restoredData?.nodeData.children?.[0];
        expect(restoredData?.nodeData.topic).toBe('Earlier');
        expect(restoredChild?.id).toMatch(/^ai_/);
        expect(restoredChild?.hyperLink).toBeUndefined();
        expect(fire).toHaveBeenCalledWith('operation', expect.objectContaining({
            name: 'restore_version',
            origin: expect.objectContaining({ topic: 'Current' }),
        }));
    });

    it('rejects a corrupted snapshot before recording or mutating the canvas', () => {
        const { mind, refresh } = createMind();
        const recordHistory = vi.fn();

        expect(() => restoreMindMapHistoryRecord({
            mind,
            record: {
                id: 'broken',
                time: '10:30:00',
                description: 'Broken state',
                data: '{not-json',
            },
            backupDescription: 'Recovery snapshot',
            dependencies: { recordHistory },
        })).toThrow();

        expect(recordHistory).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('rolls back to the protected current state when post-refresh work fails', () => {
        const { mind, refresh } = createMind({
            fireError: new Error('operation dispatch failed'),
        });

        expect(() => restoreMindMapHistoryRecord({
            mind,
            record: {
                id: 'snapshot-2',
                time: '10:31:00',
                description: 'Earlier state',
                data: JSON.stringify({ id: 'root', topic: 'Earlier', children: [] }),
            },
            backupDescription: 'Recovery snapshot',
            dependencies: { recordHistory: vi.fn() },
        })).toThrow('operation dispatch failed');

        expect(refresh).toHaveBeenCalledTimes(2);
        expect(refresh.mock.calls[0]?.[0].nodeData.topic).toBe('Earlier');
        expect(refresh.mock.calls[1]?.[0].nodeData.topic).toBe('Current');
    });

    it('rolls back when the operation bus is unavailable', () => {
        const { mind, refresh } = createMind({ busAvailable: false });

        expect(() => restoreMindMapHistoryRecord({
            mind,
            record: {
                id: 'snapshot-3',
                time: '10:32:00',
                description: 'Earlier state',
                data: JSON.stringify({ id: 'root', topic: 'Earlier', children: [] }),
            },
            backupDescription: 'Recovery snapshot',
            dependencies: { recordHistory: vi.fn() },
        })).toThrow('Mind map operation bus cannot publish events');

        expect(refresh).toHaveBeenCalledTimes(2);
        expect(refresh.mock.calls[1]?.[0].nodeData.topic).toBe('Current');
    });

    it('preserves the original error when rollback also fails', () => {
        const originalError = new Error('operation dispatch failed');
        const refresh = vi.fn((data: { nodeData: NodeObj; direction: number }): void => {
            if (data.nodeData.topic === 'Current') throw new Error('rollback failed');
        });
        const mind = {
            getData: vi.fn(() => ({
                nodeData: { id: 'root', topic: 'Current', children: [] } as NodeObj,
                direction: 2,
            })),
            refresh,
            toCenter: vi.fn(),
            bus: { fire: vi.fn((): void => { throw originalError; }) },
        };

        expect(() => restoreMindMapHistoryRecord({
            mind,
            record: {
                id: 'snapshot-4',
                time: '10:33:00',
                description: 'Earlier state',
                data: JSON.stringify({ id: 'root', topic: 'Earlier', children: [] }),
            },
            backupDescription: 'Recovery snapshot',
            dependencies: { recordHistory: vi.fn() },
        })).toThrow(originalError);

        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
