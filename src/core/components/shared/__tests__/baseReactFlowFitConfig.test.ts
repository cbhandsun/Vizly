import { describe, expect, it, vi } from 'vitest';

import {
  readBaseReactFlowFitRatio,
  readBaseReactFlowMaxFitZoom,
} from '../baseReactFlowFitConfig';

describe('baseReactFlowFitConfig', () => {
  it('prefers valid fitRatio from the URL over config', () => {
    expect(readBaseReactFlowFitRatio({
      search: '?fitRatio=1.25',
      readConfig: () => ({ canvas: { zoom: { fitRatio: 0.9 } } }),
    })).toBe(1.25);
  });

  it('falls back to config or default when fitRatio is invalid', () => {
    expect(readBaseReactFlowFitRatio({
      search: '?fitRatio=9',
      readConfig: () => ({ canvas: { zoom: { fitRatio: 0.92 } } }),
    })).toBe(0.92);

    expect(readBaseReactFlowFitRatio({
      search: '?fitRatio=oops',
      readConfig: () => ({}),
    })).toBe(0.85);
  });

  it('falls back safely when fit config reads throw', () => {
    const onReadFailure = vi.fn();

    expect(readBaseReactFlowFitRatio({
      search: '?fitRatio=1.1',
      readConfig: () => {
        throw new Error('boom');
      },
      onReadFailure,
    })).toBe(1.1);

    expect(readBaseReactFlowFitRatio({
      search: '%E0%A4%A',
      readConfig: () => {
        throw new Error('boom');
      },
      onReadFailure,
    })).toBe(0.85);

    expect(readBaseReactFlowMaxFitZoom({
      readConfig: () => {
        throw new Error('boom');
      },
      onReadFailure,
    })).toBe(1);

    expect(onReadFailure).toHaveBeenCalledTimes(2);
  });

  it('reads maxFitZoom from config with a stable default', () => {
    expect(readBaseReactFlowMaxFitZoom({
      readConfig: () => ({ canvas: { zoom: { maxFitZoom: 0.95 } } }),
    })).toBe(0.95);

    expect(readBaseReactFlowMaxFitZoom({
      readConfig: () => ({}),
    })).toBe(1);
  });

  it('rejects non-finite, negative, and excessive config values', () => {
    for (const fitRatio of [Number.NaN, Number.POSITIVE_INFINITY, -1, 3, 'not-a-number']) {
      expect(readBaseReactFlowFitRatio({
        search: '',
        readConfig: () => ({ canvas: { zoom: { fitRatio } } }),
      })).toBe(0.85);
    }

    for (const maxFitZoom of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 5]) {
      expect(readBaseReactFlowMaxFitZoom({
        readConfig: () => ({ canvas: { zoom: { maxFitZoom } } }),
      })).toBe(1);
    }
  });
});
