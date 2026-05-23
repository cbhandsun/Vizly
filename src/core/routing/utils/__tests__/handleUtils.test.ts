import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  expandHandle,
  isHorizontalHandle,
  isVerticalHandle,
  normalizeHandle,
  parseHandlePosition,
} from '../handleUtils';

describe('handleUtils', () => {
  it('parses exact handle ids into React Flow positions', () => {
    expect(parseHandlePosition('top')).toBe(Position.Top);
    expect(parseHandlePosition('b')).toBe(Position.Bottom);
    expect(parseHandlePosition('left')).toBe(Position.Left);
    expect(parseHandlePosition('r')).toBe(Position.Right);
    expect(parseHandlePosition(null)).toBeUndefined();
  });

  it('prioritizes semantic substrings for compound ids', () => {
    expect(parseHandlePosition('t-right')).toBe(Position.Right);
    expect(parseHandlePosition('source-left')).toBe(Position.Left);
    expect(parseHandlePosition('port-bottom-1')).toBe(Position.Bottom);
    expect(parseHandlePosition('node-top-anchor')).toBe(Position.Top);
    expect(parseHandlePosition('center')).toBeUndefined();
  });

  it('expands shorthand handles without changing custom ids', () => {
    expect(expandHandle('r')).toBe('right');
    expect(expandHandle('L')).toBe('left');
    expect(expandHandle('t')).toBe('top');
    expect(expandHandle('B')).toBe('bottom');
    expect(expandHandle('source-right')).toBe('source-right');
  });

  it('normalizes exact and compound handles into internal shorthand', () => {
    expect(normalizeHandle('left')).toBe('l');
    expect(normalizeHandle('RIGHT')).toBe('r');
    expect(normalizeHandle('source-top')).toBe('t');
    expect(normalizeHandle('target-bottom')).toBe('b');
    expect(normalizeHandle('unknown')).toBeUndefined();
    expect(normalizeHandle(undefined)).toBeUndefined();
  });

  it('classifies horizontal and vertical handles', () => {
    expect(isHorizontalHandle('left')).toBe(true);
    expect(isHorizontalHandle('r')).toBe(true);
    expect(isHorizontalHandle('top')).toBe(false);
    expect(isVerticalHandle('top')).toBe(true);
    expect(isVerticalHandle('b')).toBe(true);
    expect(isVerticalHandle('right')).toBe(false);
  });
});
