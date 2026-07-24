// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramTypePlugin } from '../../types';

const resetRegistry = async () => {
  const { PluginRegistry } = await import('../../services/PluginRegistry');
  (PluginRegistry as unknown as { instance?: unknown }).instance = undefined;
  delete (window as unknown as { __vizly_plugins?: unknown }).__vizly_plugins;
  localStorage.clear();
};

const fakePlugin = (id: string): DiagramTypePlugin => ({
  id,
  name: id,
  version: '1.0.0',
  description: `${id} plugin`,
  parseData: () => ({ nodes: [], edges: [] }),
  serializeData: () => ({ nodes: [], edges: [] }),
  getEmptyState: () => ({ nodes: [], edges: [] }),
  getSupportedLayouts: () => [],
  getDefaultLayout: () => '',
  getNodeTypes: () => ({}),
  getEdgeTypes: () => ({}),
});

const mockPluginModule = (path: string, exportName: string, id: string) => {
  vi.doMock(path, () => ({
    [exportName]: class {
      id = id;
      name = id;
      version = '1.0.0';
      description = `${id} plugin`;
      diagramTypes = [];
    },
  }));
};

const mockBuiltInPluginModules = () => {
  mockPluginModule('../FlowchartPlugin', 'FlowchartPlugin', 'flowchart');
  mockPluginModule('../ArchitecturePlugin', 'ArchitecturePlugin', 'architecture-diagram');
  mockPluginModule('../TimelinePlugin', 'TimelinePlugin', 'timeline-diagram');
  mockPluginModule('../MindMapPlugin', 'MindMapPlugin', 'mindmap');
  mockPluginModule('../SwimlanePlugin', 'SwimlanePlugin', 'swimlane-diagram');
  mockPluginModule('../ERDiagramPlugin', 'ERDiagramPlugin', 'er-diagram');
  mockPluginModule('../NetworkTopologyPlugin', 'NetworkTopologyPlugin', 'network');
  mockPluginModule('../SequencePlugin', 'SequencePlugin', 'sequence-diagram');
};

describe('ensureBuiltInPlugins', () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetRegistry();
    mockBuiltInPluginModules();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetRegistry();
  });

  it('single-flights concurrent initialization without duplicate registration warnings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ensureBuiltInPlugins } = await import('../builtInPlugins');

    const [first, second, third] = await Promise.all([
      ensureBuiltInPlugins(),
      ensureBuiltInPlugins(),
      ensureBuiltInPlugins(),
    ]);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(first.getPlugin('flowchart')).toBeDefined();
    expect(first.getPlugin('architecture-diagram')).toBeDefined();
    expect(first.getPlugin('timeline-diagram')).toBeDefined();
    expect(first.getPlugin('mindmap')).toBeDefined();
    expect(first.getPlugin('swimlane-diagram')).toBeDefined();
    expect(first.getPlugin('er-diagram')).toBeDefined();
    expect(first.getPlugin('network')).toBeDefined();
    expect(first.getPlugin('sequence-diagram')).toBeDefined();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('already registered'));
  });

  it('fills missing built-ins even when flowchart was already registered', async () => {
    const { PluginRegistry } = await import('../../services/PluginRegistry');
    const registry = PluginRegistry.getInstance();
    const flowchart = fakePlugin('flowchart');
    registry.register(flowchart, true);

    const { ensureBuiltInPlugins } = await import('../builtInPlugins');
    const initialized = await ensureBuiltInPlugins();

    expect(initialized.getPlugin('flowchart')).toBe(flowchart);
    expect(initialized.getPlugin('architecture-diagram')).toBeDefined();
    expect(initialized.getPlugin('timeline-diagram')).toBeDefined();
    expect(initialized.getPlugin('mindmap')).toBeDefined();
    expect(initialized.getDefaultPlugin()).toBe(flowchart);
  });
});
