import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

const strategyManagerState = vi.hoisted(() => ({
  getStrategyAsync: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('../../strategies/LayoutStrategyManager', () => ({
  LayoutStrategyManager: {
    getShared: () => strategyManagerState,
  },
}));

vi.mock('../../utils/animateLayoutTransition', () => ({
  animateLayoutTransition: vi.fn(async () => undefined),
}));

describe('useAutoLayout', () => {
  beforeEach(() => {
    vi.resetModules();
    strategyManagerState.getStrategyAsync.mockReset();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('warns via safeLog when no React Flow instance is available', async () => {
    const { useAutoLayout } = await import('../useAutoLayout');
    const { result } = renderHook(() => useAutoLayout(null));

    await act(async () => {
      await result.current.layout({ direction: 'TB' });
      await result.current.layoutWithStrategy({ strategyName: 'tree' });
    });

    expect(safeLogState.warn).toHaveBeenCalledWith('AutoLayout: No ReactFlow instance provided');
    expect(safeLogState.warn).toHaveBeenCalledWith('[AutoLayout] No ReactFlow instance');
  });

  it('warns when there are no layoutable nodes', async () => {
    const instance = {
      getNodes: () => [],
      getEdges: () => [],
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      fitView: vi.fn(),
    };

    const { useAutoLayout } = await import('../useAutoLayout');
    const { result } = renderHook(() => useAutoLayout(instance as never));

    await act(async () => {
      await result.current.layoutWithStrategy({ strategyName: 'tree' });
    });

    expect(safeLogState.warn).toHaveBeenCalledWith('[AutoLayout] 没有可布局的节点');
  });

  it('logs missing strategies and redacts strategy execution failures', async () => {
    const instance = {
      getNodes: () => [{ id: 'node-1', type: 'default' }],
      getEdges: () => [],
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      fitView: vi.fn(),
    };

    strategyManagerState.getStrategyAsync
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Authorization: Bearer live-token'));

    const { useAutoLayout } = await import('../useAutoLayout');
    const { result } = renderHook(() => useAutoLayout(instance as never));

    await act(async () => {
      await result.current.layoutWithStrategy({ strategyName: 'domain-dagre' });
      await result.current.layoutWithStrategy({ strategyName: 'domain-horizontal' });
    });

    expect(safeLogState.error).toHaveBeenCalledWith('[AutoLayout] 布局策略 "DomainDagreLayout" 未找到');
    expect(safeLogState.error).toHaveBeenCalledWith(
      '[AutoLayout] 布局失败 (domain-horizontal):',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
      })
    );
  });
});
