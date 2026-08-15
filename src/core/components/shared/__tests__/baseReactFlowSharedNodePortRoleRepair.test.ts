import { describe, expect, it } from 'vitest';

import {
  buildFacingPortPathCandidates,
  buildNearTerminalSideCandidates,
  buildSharedNodeTerminalSideCandidates,
  buildSharedSourceTrunkAdoptionCandidates,
} from '../baseReactFlowSharedNodePortRoleRepair';

describe('buildSharedNodeTerminalSideCandidates', () => {
  it('moves a WMS feedback target from the outgoing side to the shared-node incoming side', () => {
    const path = [
      { x: 5365, y: 1582 }, { x: 5365, y: 1358 }, { x: 5317, y: 1358 },
      { x: 5317, y: 109 }, { x: 4208, y: 109 }, { x: 4208, y: 60 },
      { x: 1257, y: 60 }, { x: 1257, y: 1306 }, { x: 1209, y: 1306 },
      { x: 1209, y: 1466 }, { x: 1115, y: 1466 },
    ];
    const candidates = buildSharedNodeTerminalSideCandidates(
      path,
      'target',
      { x: 969, y: 1418, width: 146, height: 96 },
      'left',
    );

    expect(candidates[0]).toEqual([
      { x: 5365, y: 1582 }, { x: 5365, y: 1358 }, { x: 5317, y: 1358 },
      { x: 5317, y: 109 }, { x: 4208, y: 109 }, { x: 4208, y: 60 },
      { x: 921, y: 60 }, { x: 921, y: 1466 }, { x: 969, y: 1466 },
    ]);
    expect(candidates.every(candidate => candidate[0] === undefined || (
      candidate[0].x === path[0].x && candidate[0].y === path[0].y
    ))).toBe(true);
  });

  it('rejects invalid geometry and budgets', () => {
    expect(buildSharedNodeTerminalSideCandidates([], 'target', { x: 0, y: 0, width: 10, height: 10 }, 'left')).toEqual([]);
    expect(buildSharedNodeTerminalSideCandidates(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      'target',
      { x: 0, y: 0, width: -1, height: 10 },
      'left',
    )).toEqual([]);
  });

  it('routes the shared-node connector through a supplied obstacle bypass lane', () => {
    const path = [
      { x: 5365, y: 1582 }, { x: 5365, y: 1630 }, { x: 5317, y: 1630 },
      { x: 5317, y: 2063 }, { x: 4586, y: 2063 }, { x: 4586, y: 2092 }, { x: 2864, y: 2092 },
      { x: 2864, y: 1754 }, { x: 2796, y: 1754 },
    ];
    const [candidate] = buildSharedNodeTerminalSideCandidates(
      path,
      'target',
      { x: 2651.2, y: 1205, width: 144, height: 95 },
      'left',
      48,
      1,
      [1942.5],
    );

    expect(candidate.slice(-4)).toEqual([
      { x: 4586, y: 1942.5 },
      { x: 2603.2, y: 1942.5 },
      { x: 2603.2, y: 1252.5 },
      { x: 2651.2, y: 1252.5 },
    ]);
  });

  it('preserves a clean outer lane while replacing a tangential terminal slide', () => {
    const path = [
      { x: 150, y: 100 }, { x: 150, y: 150 }, { x: -100, y: 150 },
      { x: -100, y: 500 }, { x: 400, y: 500 }, { x: 400, y: 200 },
      { x: 350, y: 200 },
    ];

    const candidates = buildNearTerminalSideCandidates(
      path,
      'target',
      { x: 300, y: 200, width: 100, height: 100 },
      'right',
      48,
      2,
    );

    expect(candidates[0]).toEqual([
      { x: 150, y: 100 }, { x: 150, y: 150 }, { x: -100, y: 150 },
      { x: -100, y: 500 }, { x: 448, y: 500 }, { x: 448, y: 250 },
      { x: 400, y: 250 },
    ]);
    expect(candidates.every(candidate => candidate[0].x === 150 && candidate[0].y === 100)).toBe(true);
  });

  it('builds a source-trunk-first facing route for vertically separated nodes', () => {
    const [candidate] = buildFacingPortPathCandidates(
      { x: 3495.6, y: 776.5, width: 216, height: 73 },
      { x: 4430.4, y: 1998.5, width: 136, height: 73 },
      'bottom',
      'top',
    );

    expect(candidate).toEqual([
      { x: 3603.6, y: 849.5 },
      { x: 3603.6, y: 1950.5 },
      { x: 4498.4, y: 1950.5 },
      { x: 4498.4, y: 1998.5 },
    ]);
  });

  it('reuses a peer source trunk and joins the first safe perpendicular segment', () => {
    const path = [
      { x: 1960, y: 1267 }, { x: 1960, y: 1315 }, { x: 2072, y: 1315 },
      { x: 2072, y: 1521 }, { x: 2578, y: 1521 },
      { x: 2578, y: 1253 }, { x: 2651, y: 1253 },
    ];
    const peerPath = [
      { x: 1960, y: 1294 }, { x: 1960, y: 1366 }, { x: 2008, y: 1366 },
    ];

    expect(buildSharedSourceTrunkAdoptionCandidates(path, peerPath, 48, 1)).toEqual([[
      { x: 1960, y: 1294 }, { x: 1960, y: 1521 },
      { x: 2578, y: 1521 }, { x: 2578, y: 1253 }, { x: 2651, y: 1253 },
    ]]);
  });

  it('rejects invalid shared-source input and too-short outward splices', () => {
    expect(buildSharedSourceTrunkAdoptionCandidates([], [], 48, 1)).toEqual([]);
    expect(buildSharedSourceTrunkAdoptionCandidates(
      [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 40, y: 20 }],
      [{ x: 0, y: 0 }, { x: 0, y: 10 }],
      48,
      1,
    )).toEqual([]);
  });
});
