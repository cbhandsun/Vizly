import { describe, expect, it } from 'vitest';
import {
  configureApplicationDiagramRuntime,
  getApplicationDiagramRuntime,
} from '../applicationDiagramRuntime';

describe('applicationDiagramRuntime', () => {
  it('exposes a safe synchronous preset predicate before configuration', () => {
    expect(getApplicationDiagramRuntime().isStandardPresetId(undefined)).toBe(false);
    expect(getApplicationDiagramRuntime().isStandardPresetId({})).toBe(false);
  });

  it('delegates diagram operations to the configured application adapter', async () => {
    const diagram = { id: 'diagram-1', nodes: [], edges: [] } as any;
    const registrations: unknown[] = [];

    configureApplicationDiagramRuntime({
      isStandardPresetId: (id) => id === 'preset-1',
      loadStandardPreset: async (id) => id === 'preset-1' ? diagram : null,
      loadDiagram: async (id, options) => id === 'diagram-1' && options?.initialize ? diagram : null,
      registerDiagram: async (content) => {
        registrations.push(content);
        return diagram;
      },
      listDiagrams: async () => [diagram],
    });

    const runtime = getApplicationDiagramRuntime();
    expect(runtime.isStandardPresetId('preset-1')).toBe(true);
    await expect(runtime.loadStandardPreset('preset-1')).resolves.toBe(diagram);
    await expect(runtime.loadDiagram('diagram-1', { initialize: true })).resolves.toBe(diagram);
    await expect(runtime.registerDiagram(diagram, { id: 'diagram-1', title: 'Diagram' })).resolves.toBe(diagram);
    await expect(runtime.listDiagrams()).resolves.toEqual([diagram]);
    expect(registrations).toEqual([diagram]);
  });

  it('normalizes ids and titles before invoking the application adapter', async () => {
    const calls: any[] = [];
    configureApplicationDiagramRuntime({
      isStandardPresetId: (id) => id === 'unsafe-id',
      loadStandardPreset: async (id) => ({ id: String(id), nodes: [], edges: [] } as any),
      loadDiagram: async (id) => ({ id, nodes: [], edges: [] } as any),
      registerDiagram: async (_content, fallback, _persist, overrides) => {
        calls.push({ fallback, overrides });
        return { id: fallback.id, nodes: [], edges: [] } as any;
      },
      listDiagrams: async () => [],
    });

    const runtime = getApplicationDiagramRuntime();
    expect(runtime.isStandardPresetId('unsafe\u0000 id')).toBe(true);
    await expect(runtime.loadDiagram({} as any)).resolves.toBeNull();
    await runtime.registerDiagram({}, {
      id: 'diagram\u0000 id',
      title: 'x'.repeat(300),
    });

    expect(calls[0].fallback.id).toBe('diagram-id');
    expect(calls[0].fallback.title).toHaveLength(240);
    expect(calls[0].overrides.id).toBe('diagram-id');
  });

  it('rejects registrations without a usable id before reaching the adapter', async () => {
    let invoked = false;
    configureApplicationDiagramRuntime({
      isStandardPresetId: () => false,
      loadStandardPreset: async () => null,
      loadDiagram: async () => null,
      registerDiagram: async () => {
        invoked = true;
        return { id: 'unexpected', nodes: [], edges: [] } as any;
      },
      listDiagrams: async () => [],
    });

    await expect(getApplicationDiagramRuntime().registerDiagram({}, { id: '', title: '' }))
      .rejects.toThrow('valid diagram id');
    expect(invoked).toBe(false);
  });
});
