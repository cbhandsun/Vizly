import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateCategory } from '../../types/Template';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('useTemplates', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts storage load failures before logging and falls back to an empty template list', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer live-token');
    });

    const { useTemplates } = await import('../useTemplates');
    const { result } = renderHook(() => useTemplates());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.customTemplates).toEqual([]);
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[useTemplates.loadFromStorage] Failed to read "diagram-custom-templates":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('live-token');
  });

  it('warns when a template is missing and logs storage save failures safely', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('api_key=test-api-key-placeholder-0004');
    });

    const { useTemplates } = await import('../useTemplates');
    const { result } = renderHook(() => useTemplates());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.createFromTemplate('missing')).toBeNull();
    expect(safeLogState.warn).toHaveBeenCalledWith('[useTemplates] Template not found: missing');

    let saved = null;
    act(() => {
      saved = result.current.saveAsTemplate(
        {
          name: 'Custom Template',
          category: TemplateCategory.CUSTOM,
        },
        [{ id: 'node-1' }],
        []
      );
    });

    expect(saved).toBeNull();
    expect(setItemSpy).toHaveBeenCalled();
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[useTemplates.saveToStorage] Failed to write "diagram-custom-templates":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls.at(-1)?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls.at(-1)?.[1])).not.toContain('test-api-key-placeholder-0004');
  });

  it('deep clones template diagram data with the local clone helper', async () => {
    const { useTemplates } = await import('../useTemplates');
    const { result } = renderHook(() => useTemplates());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const nodes = [{ id: 'node-1', data: { label: 'Original' } }];
    const edges = [{ id: 'edge-1', source: 'node-1', target: 'node-2', data: { weight: 1 } }];

    let savedId = '';
    act(() => {
      const saved = result.current.saveAsTemplate(
        {
          name: 'Clone Template',
          category: TemplateCategory.CUSTOM,
        },
        nodes,
        edges
      );
      savedId = saved?.id ?? '';
    });

    nodes[0].data.label = 'Mutated source';
    edges[0].data.weight = 2;

    const created = result.current.createFromTemplate(savedId);
    expect(created?.nodes).toEqual([{ id: 'node-1', data: { label: 'Original' } }]);
    expect(created?.edges).toEqual([{ id: 'edge-1', source: 'node-1', target: 'node-2', data: { weight: 1 } }]);

    const createdNodes = created?.nodes as typeof nodes | undefined;
    if (createdNodes) createdNodes[0].data.label = 'Mutated clone';

    const createdAgain = result.current.createFromTemplate(savedId);
    expect(createdAgain?.nodes).toEqual([{ id: 'node-1', data: { label: 'Original' } }]);
  });
});
