import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { withDisplayLocalShortcutSoftCrossingBridge } from '../baseReactFlowDisplaySoftCrossingBridge';

const edgeWithPath = (
  id: string,
  computedPath: Array<{ x: number; y: number }>,
  data: Record<string, unknown> = {},
): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { ...data, computedPath },
});

describe('display local shortcut soft crossing bridges', () => {
  it('marks only a bounded tree-bus shortcut crossing', () => {
    const shortcut = edgeWithPath('main', [
      { x: 0, y: 0 }, { x: 0, y: 50 }, { x: 800, y: 50 }, { x: 800, y: 100 },
    ], { isTreeBus: true });
    const blocker = edgeWithPath('blocker', [{ x: 400, y: 0 }, { x: 400, y: 100 }]);

    expect(withDisplayLocalShortcutSoftCrossingBridge(
      shortcut,
      [shortcut, blocker],
      800,
    ).data?.h).toBe(';400,50;');
    expect(withDisplayLocalShortcutSoftCrossingBridge(
      shortcut,
      [shortcut, blocker],
      319,
    )).toBe(shortcut);
  });

  it('does not mark ordinary edges or unbounded crossing clusters', () => {
    const ordinary = edgeWithPath('ordinary', [
      { x: 0, y: 0 }, { x: 0, y: 50 }, { x: 800, y: 50 }, { x: 800, y: 100 },
    ]);
    const treeBus = { ...ordinary, id: 'tree', data: { ...ordinary.data, isTreeBus: true } };
    const blockers = [200, 400, 600].map((x, index) => edgeWithPath(
      `blocker-${index}`,
      [{ x, y: 0 }, { x, y: 100 }],
    ));

    expect(withDisplayLocalShortcutSoftCrossingBridge(
      ordinary,
      [ordinary, blockers[0]],
      800,
    )).toBe(ordinary);
    expect(withDisplayLocalShortcutSoftCrossingBridge(
      treeBus,
      [treeBus, ...blockers],
      800,
    )).toBe(treeBus);
  });
});
