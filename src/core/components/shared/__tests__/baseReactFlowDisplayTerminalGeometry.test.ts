import { describe, expect, it } from 'vitest';
import {
  buildDeclaredTerminalInsetNudgeCandidates,
  buildShortTerminalStaircaseTranslationCandidate,
  inferTerminalGeometrySide,
} from '../baseReactFlowDisplayTerminalGeometry';

describe('baseReactFlowDisplayTerminalGeometry', () => {
  it('translates a subpixel-short source staircase without moving its endpoint', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 47, y: 0 },
      { x: 47, y: 50 },
      { x: 100, y: 50 },
    ];

    expect(buildShortTerminalStaircaseTranslationCandidate(path, 'source', 'right')).toEqual([
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 50 },
      { x: 100, y: 50 },
    ]);
    expect(buildShortTerminalStaircaseTranslationCandidate(
      [{ x: 0, y: 0 }, { x: 45, y: 0 }, { x: 45, y: 50 }, { x: 100, y: 50 }],
      'source',
      'right',
    )).toBeNull();
  });

  it('infers direct and staircase terminal sides from node boundaries', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };

    expect(inferTerminalGeometrySide(
      [{ x: 100, y: 25 }, { x: 148, y: 25 }],
      'source',
      rect,
    )).toBe('right');
    expect(inferTerminalGeometrySide(
      [{ x: 100, y: 10 }, { x: 100, y: 25 }, { x: 148, y: 25 }],
      'source',
      rect,
    )).toBe('right');
    expect(inferTerminalGeometrySide([], 'source', rect)).toBeNull();
  });

  it('keeps declared inset candidates on the requested boundary and finite', () => {
    const rect = { x: 0, y: 0, width: 120, height: 80 };
    const candidates = buildDeclaredTerminalInsetNudgeCandidates(
      [{ x: 120, y: 40 }, { x: 168, y: 40 }, { x: 168, y: 120 }],
      'source',
      rect,
      'right',
    );

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(candidate => candidate[0].x === 120)).toBe(true);
    expect(candidates.every(candidate => candidate.every(point => (
      Number.isFinite(point.x) && Number.isFinite(point.y)
    )))).toBe(true);
  });
});
