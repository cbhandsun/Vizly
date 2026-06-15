import { describe, expect, it } from 'vitest';
import {
  computeManhattanPath,
  computeSimpleOrthogonalPath,
  parseHandleDirection,
  type Direction,
} from '../simpleFallbackPath';

const start = { x: 10, y: 20 };
const end = { x: 110, y: 80 };

describe('simpleFallbackPath', () => {
  it.each([
    ['right', 'left', 'M 10,20 L 40,20 L 40,50 L 80,50 L 80,80 L 110,80'],
    ['left', 'right', 'M 10,20 L -20,20 L -20,50 L 140,50 L 140,80 L 110,80'],
    ['top', 'bottom', 'M 10,20 L 10,-10 L 60,-10 L 60,110 L 110,110 L 110,80'],
    ['bottom', 'top', 'M 10,20 L 10,50 L 60,50 L 60,50 L 110,50 L 110,80'],
    ['right', 'top', 'M 10,20 L 40,20 L 40,50 L 40,50 L 110,50 L 110,80'],
    ['bottom', 'left', 'M 10,20 L 10,50 L 80,50 L 80,50 L 80,80 L 110,80'],
  ] as Array<[Direction, Direction, string]>)(
    'computes a deterministic Manhattan path for %s to %s ports',
    (startDir, endDir, expected) => {
      expect(computeManhattanPath(start, end, startDir, endDir)).toBe(expected);
    }
  );

  it.each([
    ['right', 'left', 'M 10,20 L 60,20 L 60,80 L 110,80'],
    ['top', 'bottom', 'M 10,20 L 10,50 L 110,50 L 110,80'],
    ['right', 'top', 'M 10,20 L 110,20 L 110,80'],
    ['bottom', 'left', 'M 10,20 L 10,80 L 110,80'],
  ] as Array<[Direction, Direction, string]>)(
    'computes a simple orthogonal preview path for %s to %s ports',
    (startDir, endDir, expected) => {
      expect(computeSimpleOrthogonalPath(start, end, startDir, endDir)).toBe(expected);
    }
  );

  it.each([
    [undefined, 'right'],
    [null, 'right'],
    ['', 'right'],
    [' t ', 'top'],
    ['B', 'bottom'],
    ['l', 'left'],
    ['RIGHT', 'right'],
    ['source-left-handle', 'left'],
    ['target-bottom-port', 'bottom'],
    ['unknown', 'right'],
  ] as Array<[string | null | undefined, Direction]>)(
    'parses handle id %s as %s',
    (handleId, expected) => {
      expect(parseHandleDirection(handleId)).toBe(expected);
    }
  );
});
