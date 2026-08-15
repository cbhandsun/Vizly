// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { useAlignment } from '../useAlignment';

const node = (id: string, x: number, width: number): Node => ({
    id,
    position: { x, y: 20 },
    width,
    height: 40,
    data: { label: id },
});

describe('useAlignment', () => {
    it('distributes different-width nodes using equal visible gaps', () => {
        const onUpdateNodes = vi.fn();
        const selectedNodes = [
            node('a', 0, 50),
            node('b', 100, 100),
            node('c', 300, 50),
        ];
        const { result } = renderHook(() => useAlignment({ selectedNodes, onUpdateNodes }));

        act(() => result.current.handleDistribute('horizontal'));

        expect(onUpdateNodes).toHaveBeenCalledWith([
            { id: 'a', position: { x: 0, y: 20 } },
            { id: 'b', position: { x: 125, y: 20 } },
            { id: 'c', position: { x: 300, y: 20 } },
        ]);
    });

    it('does not create an update for an already aligned or distributed selection', () => {
        const onUpdateNodes = vi.fn();
        const selectedNodes = [
            node('a', 0, 50),
            node('b', 125, 100),
            node('c', 300, 50),
        ];
        const { result } = renderHook(() => useAlignment({ selectedNodes, onUpdateNodes }));

        act(() => result.current.handleDistribute('horizontal'));
        expect(onUpdateNodes).not.toHaveBeenCalled();

        act(() => result.current.handleAlign('top'));
        expect(onUpdateNodes).not.toHaveBeenCalled();
    });
});
