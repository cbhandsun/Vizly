import { act, renderHook, waitFor } from '@testing-library/react';
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
  const sharedIntegration = () => ({
    isReady: () => true,
    getStatus: () => ({
      layeredConfigReady: true,
      themeSystemReady: true,
      validationReady: true,
      performanceOptimizerReady: true,
      migrationComplete: true,
    }),
    dispose: vi.fn(),
  });

  beforeEach(() => {
    vi.resetModules();
    configIntegrationMocks.createConfigIntegration.mockReset();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('does not dispose the application-owned integration when one consumer unmounts', async () => {
    const integration = sharedIntegration();
    configIntegrationMocks.createConfigIntegration.mockResolvedValue(integration);
    const { useConfigIntegration } = await import('../useConfigIntegration');
    const first = renderHook(() => useConfigIntegration());
    const second = renderHook(() => useConfigIntegration());
    await waitFor(() => expect(first.result.current[0].isReady).toBe(true));
    await waitFor(() => expect(second.result.current[0].isReady).toBe(true));

    first.unmount();
    expect(integration.dispose).not.toHaveBeenCalled();
    expect(second.result.current[0].integration).toBe(integration);
    second.unmount();
    expect(integration.dispose).not.toHaveBeenCalled();
  });

  it('does not dispose a shared initialization that resolves after its consumer unmounts', async () => {
    const integration = sharedIntegration();
    let finishInitialization: () => void = () => { throw new Error('Initialization has not started'); };
    const pending = new Promise<typeof integration>(resolve => {
      finishInitialization = () => resolve(integration);
    });
    configIntegrationMocks.createConfigIntegration.mockReturnValue(pending);
    const { useConfigIntegration } = await import('../useConfigIntegration');
    const consumer = renderHook(() => useConfigIntegration());
    await waitFor(() => expect(configIntegrationMocks.createConfigIntegration).toHaveBeenCalledOnce());
    consumer.unmount();
    await act(async () => { finishInitialization(); });

    expect(integration.dispose).not.toHaveBeenCalled();
    const next = renderHook(() => useConfigIntegration());
    await waitFor(() => expect(next.result.current[0].integration).toBe(integration));
    next.unmount();
  });

  it('removes only its own config subscription when a consumer unmounts', async () => {
    const unsubscribe = vi.fn();
    const integration = {
      ...sharedIntegration(),
      getLayeredConfigManager: () => ({
        getConfig: vi.fn().mockResolvedValue('current'),
        addListener: vi.fn(() => unsubscribe),
      }),
    };
    configIntegrationMocks.createConfigIntegration.mockResolvedValue(integration);
    const { useConfigValue } = await import('../useConfigIntegration');
    const consumer = renderHook(() => useConfigValue('feature.flag', 'fallback'));
    await waitFor(() => expect(consumer.result.current[0]).toBe('current'));
    consumer.unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(integration.dispose).not.toHaveBeenCalled();
  });

  it('preserves the active global theme CSS when an integration consumer unmounts', async () => {
    const { EnhancedThemeManager } = await import('../../themes/EnhancedThemeManager');
    const integrationTheme = new EnhancedThemeManager({ enableTransitions: false });
    const activeTheme = new EnhancedThemeManager({ enableTransitions: false });
    try {
      await waitFor(() => expect(integrationTheme.getCurrentTheme()).toBeDefined());
      await waitFor(() => expect(activeTheme.getCurrentTheme()).toBeDefined());
      await activeTheme.setTheme('dark');
      const primary = () => document.documentElement.style.getPropertyValue('--theme-primary-main');
      expect(primary()).toBe('#177ddc');
      const integration = { ...sharedIntegration(), dispose: vi.fn(() => integrationTheme.dispose()) };
      configIntegrationMocks.createConfigIntegration.mockResolvedValue(integration);
      const { useConfigIntegration } = await import('../useConfigIntegration');
      const consumer = renderHook(() => useConfigIntegration());
      await waitFor(() => expect(consumer.result.current[0].isReady).toBe(true));
      consumer.unmount();

      expect(primary()).toBe('#177ddc');
      expect(activeTheme.getCurrentThemeId()).toBe('dark');
      expect(integration.dispose).not.toHaveBeenCalled();
    } finally {
      integrationTheme.dispose();
      activeTheme.dispose();
      document.documentElement.classList.remove('dark');
    }
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
