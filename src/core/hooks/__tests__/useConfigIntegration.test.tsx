import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigLayer } from '../../config/LayeredConfigManager';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

const configIntegrationMocks = vi.hoisted(() => ({
  createConfigIntegration: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('../../config/ConfigIntegration', () => ({
  createConfigIntegration: configIntegrationMocks.createConfigIntegration,
  ConfigIntegration: class {},
}));

vi.mock('../../config/DiagramConfig', () => ({
  diagramConfigManager: {},
}));

describe('useConfigIntegration', () => {
  beforeEach(() => {
    vi.resetModules();
    configIntegrationMocks.createConfigIntegration.mockReset();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts initialization failures before logging them', async () => {
    configIntegrationMocks.createConfigIntegration.mockRejectedValueOnce(
      new Error('Authorization: Bearer live-token')
    );

    const { useConfigIntegration } = await import('../useConfigIntegration');
    const { result } = renderHook(() => useConfigIntegration());

    await waitFor(() => expect(configIntegrationMocks.createConfigIntegration).toHaveBeenCalled());
    await waitFor(() => expect(safeLogState.error).toHaveBeenCalled());

    expect(result.current[0].error).toBe('Authorization: Bearer live-token');
    expect(safeLogState.error).toHaveBeenCalledWith(
      'ConfigIntegration initialization failed:',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
      })
    );
    expect(safeLogState.error).toHaveBeenCalledWith(
      'Failed to initialize ConfigIntegration:',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
      })
    );
  });

  it('redacts config access failures before warning and falls back to the default value', async () => {
    const getConfig = vi.fn().mockRejectedValue(new Error('api_key=test-api-key-placeholder-0006'));
    const addListener = vi.fn(() => () => undefined);
    const integration = {
      isReady: () => true,
      getStatus: () => ({
        layeredConfigReady: true,
        themeSystemReady: true,
        validationReady: true,
        performanceOptimizerReady: true,
        migrationComplete: true,
      }),
      dispose: vi.fn(),
      getLayeredConfigManager: () => ({
        getConfig,
        addListener,
        setConfig: vi.fn(),
        remove: vi.fn(),
      }),
      getThemeManager: () => ({
        addThemeChangeListener: () => () => undefined,
        getCurrentTheme: () => null,
        setTheme: vi.fn(),
      }),
      getPerformanceOptimizer: () => null,
    };

    configIntegrationMocks.createConfigIntegration.mockResolvedValue(integration);

    const { useConfigValue } = await import('../useConfigIntegration');
    const { result } = renderHook(() => useConfigValue('feature.flag', 'fallback', {
      autoInitialize: true,
    }));

    await waitFor(() => expect(configIntegrationMocks.createConfigIntegration).toHaveBeenCalled());
    await waitFor(() => expect(getConfig).toHaveBeenCalledWith('feature.flag'));
    await waitFor(() => expect(result.current[0]).toBe('fallback'));

    expect(safeLogState.warn).toHaveBeenCalledWith(
      'Failed to load config feature.flag:',
      expect.objectContaining({
        message: 'api_key=[redacted]',
      })
    );
  });

  it('redacts setConfig failures before logging them', async () => {
    const setConfig = vi.fn().mockRejectedValue(new Error('Authorization: Bearer live-token'));
    const integration = {
      isReady: () => true,
      getStatus: () => ({
        layeredConfigReady: true,
        themeSystemReady: true,
        validationReady: true,
        performanceOptimizerReady: true,
        migrationComplete: true,
      }),
      dispose: vi.fn(),
      getLayeredConfigManager: () => ({
        getConfig: vi.fn(),
        addListener: vi.fn(() => () => undefined),
        setConfig,
        remove: vi.fn(),
      }),
      getThemeManager: () => ({
        addThemeChangeListener: () => () => undefined,
        getCurrentTheme: () => null,
        setTheme: vi.fn(),
      }),
      getPerformanceOptimizer: () => null,
    };

    configIntegrationMocks.createConfigIntegration.mockResolvedValue(integration);

    const { useConfigIntegration } = await import('../useConfigIntegration');
    const { result } = renderHook(() => useConfigIntegration());

    await waitFor(() => expect(result.current[0].isReady).toBe(true));

    await expect(result.current[1].setConfig('feature.flag', true, ConfigLayer.USER)).rejects.toThrow(
      'Authorization: Bearer live-token'
    );

    expect(safeLogState.error).toHaveBeenCalledWith(
      'Failed to set config feature.flag:',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
      })
    );
  });
});
