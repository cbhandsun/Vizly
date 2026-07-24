import { describe, expect, it } from 'vitest';
import {
  buildTinyCornerBypassCandidate,
  buildTinyEndpointOffsetCandidates,
  buildTinyInteriorBridgeCollapseCandidate,
  buildTinyTerminalBridgeCollapseCandidates,
} from '../edgeLocalDoglegTinyCandidates';

const tinyBridge = [
  { x: 0, y: 0 },
  { x: 0, y: 20 },
  { x: 3, y: 20 },
  { x: 3, y: 40 },
  { x: 20, y: 40 },
];

describe('edgeLocalDoglegTinyCandidates', () => {
  it('collapses tiny interior bridges while preserving an orthogonal route', () => {
    const collapsed = buildTinyInteriorBridgeCollapseCandidate(tinyBridge, 0);
    const bypassed = buildTinyCornerBypassCandidate(tinyBridge, 0);

    expect(collapsed).not.toBeNull();
    expect(bypassed).not.toBeNull();
    for (const candidate of [collapsed!, bypassed!]) {
      expect(candidate.slice(1).every((point, index) => (
        point.x === candidate[index].x || point.y === candidate[index].y
      ))).toBe(true);
    }
  });

  it('produces bounded endpoint alternatives for a tiny terminal bridge', () => {
    const terminalPath = tinyBridge.slice(0, 4);

    expect(buildTinyEndpointOffsetCandidates(terminalPath, 0, null, null).length).toBeGreaterThan(0);
    expect(buildTinyTerminalBridgeCollapseCandidates(
      terminalPath,
      0,
      null,
      null,
    )).toEqual([
      expect.objectContaining({ preserveEndpoints: true }),
    ]);
  });

  it('rejects incomplete point windows', () => {
    expect(buildTinyEndpointOffsetCandidates([], 0, null, null)).toEqual([]);
    expect(buildTinyTerminalBridgeCollapseCandidates([], 0, null, null)).toEqual([]);
    expect(buildTinyInteriorBridgeCollapseCandidate([], 0)).toBeNull();
    expect(buildTinyCornerBypassCandidate([], 0)).toBeNull();
  });
});
