import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

import { safeJsonParse, safeJsonParseArray, safeJsonParseWithLimit } from '../jsonUtils';

describe('jsonUtils', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
  });

  it('returns fallback values and redacts parse errors before warning', () => {
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw new Error('token=sk-live-secret');
    });
    const result = safeJsonParse('{"token":"sk-live-secret"}', { ok: false });

    expect(result).toEqual({ ok: false });
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[safeJsonParse] Failed to parse JSON, returning fallback.',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('sk-live-secret');
    parseSpy.mockRestore();
  });

  it('warns when an array parse yields a non-array and redacts thrown parse errors', () => {
    expect(safeJsonParseArray<number>('{"items":[1,2,3]}')).toEqual([]);
    expect(safeLogState.warn).toHaveBeenCalledWith('[safeJsonParseArray] Expected Array but got:', 'object');

    safeLogState.warn.mockReset();
    expect(safeJsonParseArray<number>('[1,2,')).toEqual([]);
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[safeJsonParseArray] Failed to parse JSON, returning [].',
      expect.anything()
    );
  });

  it('supports bounded parsing with explicit failure callbacks', () => {
    const onFailure = vi.fn();

    expect(safeJsonParseWithLimit('{"ok":true}', null, {
      maxLength: 100,
      onFailure,
    })).toEqual({ ok: true });

    expect(safeJsonParseWithLimit('{bad-json', { ok: false }, {
      maxLength: 100,
      onFailure,
    })).toEqual({ ok: false });

    expect(safeJsonParseWithLimit('x'.repeat(101), { ok: false }, {
      maxLength: 100,
      onFailure,
      buildOversizeError: () => new Error('bounded json too large'),
    })).toEqual({ ok: false });

    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(String(onFailure.mock.calls[1]?.[0])).toContain('bounded json too large');
  });
});
