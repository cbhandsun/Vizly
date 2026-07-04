import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('layoutUtilsLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts user-supplied values before logging shared layout fallbacks', async () => {
    const {
      logInvalidHexColor,
      logInvalidHexFormat,
      logHexParseFailure,
      logDomainThemeFallback,
    } = await import('../layoutUtilsLogging');

    logInvalidHexColor('Authorization: Bearer color-secret');
    logInvalidHexFormat('cookie=format-secret');
    logHexParseFailure('api_key=parse-secret');
    logDomainThemeFallback('token=domain-secret');

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[layoutUtils] Invalid hex color; using default gray:');
    expect(warnPayload).toContain('[layoutUtils] Invalid hex format; using default gray:');
    expect(warnPayload).toContain('[layoutUtils] Failed to parse hex color; using default gray:');
    expect(warnPayload).toContain('[layoutUtils] Theme is undefined for domain; using default theme:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('color-secret');
    expect(warnPayload).not.toContain('format-secret');
    expect(warnPayload).not.toContain('parse-secret');
    expect(warnPayload).not.toContain('domain-secret');
  });
});
