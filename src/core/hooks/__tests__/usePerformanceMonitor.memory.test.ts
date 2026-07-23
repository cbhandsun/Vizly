import { describe, expect, it } from 'vitest';
import { coercePerformanceMemory } from '../usePerformanceMonitor';

describe('coercePerformanceMemory', () => {
  it('accepts finite non-negative browser heap metrics', () => {
    expect(coercePerformanceMemory({
      usedJSHeapSize: 10,
      totalJSHeapSize: 20,
      jsHeapSizeLimit: 100,
    })).toEqual({
      usedJSHeapSize: 10,
      totalJSHeapSize: 20,
      jsHeapSizeLimit: 100,
    });
  });

  it('rejects empty, malformed, non-finite, negative, and zero-limit metrics', () => {
    expect(coercePerformanceMemory(null)).toBeNull();
    expect(coercePerformanceMemory({})).toBeNull();
    expect(coercePerformanceMemory({
      usedJSHeapSize: Number.NaN,
      totalJSHeapSize: 20,
      jsHeapSizeLimit: 100,
    })).toBeNull();
    expect(coercePerformanceMemory({
      usedJSHeapSize: -1,
      totalJSHeapSize: 20,
      jsHeapSizeLimit: 100,
    })).toBeNull();
    expect(coercePerformanceMemory({
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0,
    })).toBeNull();
  });
});
