import { describe, expect, it } from 'vitest';
import {
  extractFiniteNumber,
  extractValidNumber,
  validateAndFixNodeMeasured,
  validateAndFixNodes,
  validateCompleteNode,
  validateNodePosition,
  validateNodeStyle,
} from '../nodeValidation';

describe('nodeValidation', () => {
  it.each([
    [20, 10, 20],
    ['42px', 10, 42],
    ['0', 10, 10],
    [0, 10, 10],
    [-5, 10, 10],
    [Number.NaN, 10, 10],
    [Number.POSITIVE_INFINITY, 10, 10],
    ['bad', 10, 10],
  ])('extracts positive size number from %s', (value, fallback, expected) => {
    expect(extractValidNumber(value, fallback)).toBe(expected);
  });

  it.each([
    [20, 10, 20],
    ['-42.5px', 10, -42.5],
    [0, 10, 0],
    [-5, 10, -5],
    [Number.NaN, 10, 10],
    [Number.POSITIVE_INFINITY, 10, 10],
    ['bad', 10, 10],
  ])('extracts finite coordinate number from %s', (value, fallback, expected) => {
    expect(extractFiniteNumber(value, fallback)).toBe(expected);
  });

  it('validates positions while preserving negative coordinates', () => {
    expect(validateNodePosition({ x: '-10px', y: Number.POSITIVE_INFINITY })).toEqual({ x: -10, y: 0 });
    expect(validateNodePosition(undefined)).toEqual({ x: 0, y: 0 });
  });

  it('validates style objects and drops invalid non-object styles', () => {
    expect(validateNodeStyle(null)).toEqual({});
    expect(validateNodeStyle('bad')).toEqual({});
    expect(validateNodeStyle({ width: '240px', height: -1, color: 'red' })).toEqual({
      width: 240,
      height: 100,
      color: 'red',
    });
    expect(validateNodeStyle({ minWidth: '10px' })).toEqual({ minWidth: '10px' });
  });

  it('creates missing measured values from style, node size, or defaults', () => {
    const fromStyle = validateAndFixNodeMeasured({ style: { width: '300px', height: '160px' } });
    expect(fromStyle.measured).toEqual({ width: 300, height: 160 });

    const fromNode = validateAndFixNodeMeasured({ width: 80, height: 40 });
    expect(fromNode.measured).toEqual({ width: 80, height: 40 });

    const fallback = validateAndFixNodeMeasured({});
    expect(fallback.measured).toEqual({ width: 200, height: 100 });

    expect(validateAndFixNodeMeasured(null)).toBeNull();
  });

  it('repairs invalid measured values while preserving extra measured fields', () => {
    const node = validateAndFixNodeMeasured({
      measured: {
        width: Number.NaN,
        height: '75px',
        ready: true,
      },
    });

    expect(node.measured).toEqual({
      width: 200,
      height: 75,
      ready: true,
    });
  });

  it('validates complete nodes and batches only arrays', () => {
    expect(validateCompleteNode(null)).toBeNull();

    const node = validateCompleteNode({
      id: 'n1',
      position: { x: '-20px', y: '30px' },
      style: { width: '-1', height: '90px' },
      measured: { width: 0, height: Number.POSITIVE_INFINITY },
    });

    expect(node).toMatchObject({
      id: 'n1',
      position: { x: -20, y: 30 },
      style: { width: 200, height: 90 },
      measured: { width: 200, height: 100 },
    });

    expect(validateAndFixNodes('bad' as unknown as unknown[])).toEqual([]);
    expect(validateAndFixNodes([{ id: 'n2', position: {}, style: {} }])).toEqual([
      expect.objectContaining({
        id: 'n2',
        position: { x: 0, y: 0 },
        measured: { width: 200, height: 100 },
      }),
    ]);
  });
});
