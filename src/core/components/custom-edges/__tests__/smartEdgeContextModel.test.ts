import { describe, expect, it } from 'vitest';
import {
  getEdgeData,
  isLayoutDirection,
  readHandlePair,
  smartEdgeContextCache,
} from '../smartEdgeContextModel';

describe('smartEdgeContextModel', () => {
  it('accepts only supported layout directions', () => {
    expect(['LR', 'RL', 'TB', 'BT'].every(isLayoutDirection)).toBe(true);
    expect(isLayoutDirection('diagonal')).toBe(false);
    expect(isLayoutDirection(null)).toBe(false);
  });

  it('normalizes untrusted edge data before the hook consumes it', () => {
    expect(getEdgeData(null)).toEqual({});
    expect(getEdgeData('invalid')).toEqual({});
    expect(getEdgeData({ borderRadius: 12 })).toEqual({ borderRadius: 12 });
  });

  it('coerces manual handle flags without leaking arbitrary values', () => {
    expect(readHandlePair(true)).toEqual({ source: true, target: true });
    expect(readHandlePair({ source: 1, target: 0 })).toEqual({
      source: true,
      target: false,
    });
    expect(readHandlePair('true')).toEqual({ source: false, target: false });
  });

  it('keeps topology caches bounded and resettable by the hook', () => {
    smartEdgeContextCache.directionVotes.clear();
    smartEdgeContextCache.multiEdgeLists.clear();
    smartEdgeContextCache.topologySignature = -1;

    expect(smartEdgeContextCache.directionVotes.size).toBe(0);
    expect(smartEdgeContextCache.multiEdgeLists.size).toBe(0);
    expect(smartEdgeContextCache.topologySignature).toBe(-1);
  });
});
