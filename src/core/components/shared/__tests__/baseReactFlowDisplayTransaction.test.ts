import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { chooseSmallestAcceptedDisplayTransaction } from '../baseReactFlowDisplayTransaction';

const edge = (id: string, y: number): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: {
    computedPath: [
      { x: 0, y },
      { x: 100, y },
    ],
  },
});

describe('chooseSmallestAcceptedDisplayTransaction', () => {
  it('commits only the smallest accepted subset of a multi-edge candidate', () => {
    const baseline = [edge('first', 0), edge('second', 20), edge('third', 40)];
    const candidate = [edge('first', 10), edge('second', 30), edge('third', 50)];

    const result = chooseSmallestAcceptedDisplayTransaction(
      baseline,
      candidate,
      transaction => ((transaction[1].data as any).computedPath[0].y === 30),
    );

    expect(result).not.toBeNull();
    expect(result?.[0]).toBe(baseline[0]);
    expect(result?.[1]).toBe(candidate[1]);
    expect(result?.[2]).toBe(baseline[2]);
  });

  it('rejects reordered candidates instead of applying paths to the wrong edge', () => {
    const baseline = [edge('first', 0), edge('second', 20)];
    const candidate = [edge('second', 30), edge('first', 10)];

    expect(chooseSmallestAcceptedDisplayTransaction(
      baseline,
      candidate,
      () => true,
    )).toBeNull();
  });

  it('reports the exact changed indexes for each bounded transaction', () => {
    const baseline = [edge('first', 0), edge('second', 20), edge('third', 40)];
    const candidate = [edge('first', 10), edge('second', 30), edge('third', 50)];
    const isAccepted = vi.fn((_transaction: Edge[], changedIndexes: readonly number[]) => (
      changedIndexes.length === 2 && changedIndexes[0] === 0 && changedIndexes[1] === 2
    ));

    const result = chooseSmallestAcceptedDisplayTransaction(
      baseline,
      candidate,
      isAccepted,
    );

    expect(result?.[0]).toBe(candidate[0]);
    expect(result?.[1]).toBe(baseline[1]);
    expect(result?.[2]).toBe(candidate[2]);
    expect(isAccepted.mock.calls.slice(0, 3).map(call => call[1])).toEqual([[0], [1], [2]]);
    expect(isAccepted.mock.calls.at(-1)?.[1]).toEqual([0, 2]);
  });
});
