import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ plugins: vi.fn(), preset: vi.fn(), route: vi.fn() }));
vi.mock('@vizly/core/plugins', () => ({ ensureBuiltInPlugins: mocks.plugins }));
vi.mock('@vizly/core/react', () => ({ FlowchartDesigner: () => null }));
vi.mock('@vizly/core/routing-runtime', () => ({ prefetchBaseReactFlowPrecompiledRoute: mocks.route }));
vi.mock('@/data/standardized/presetLoader', () => ({ loadStandardPresetById: mocks.preset }));
import { getFlowchartDesignerComponent, loadFlowchartDesigner } from '../diagramViewerFlowchartLoader';

describe('designer component loading boundary', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.plugins.mockResolvedValue(undefined); mocks.route.mockResolvedValue(false); });
  it('preserves lazy identity across route retries without mixing document or plugin identities', () => {
    const renderer = getFlowchartDesignerComponent('flowchart', 'cloud-copy-a');
    expect(getFlowchartDesignerComponent('flowchart', 'cloud-copy-a')).toBe(renderer);
    expect(getFlowchartDesignerComponent('mindmap', 'cloud-copy-a')).not.toBe(renderer);
    expect(getFlowchartDesignerComponent('flowchart', 'cloud-copy-b')).not.toBe(renderer);
    expect(getFlowchartDesignerComponent(undefined, '')).not.toBe(getFlowchartDesignerComponent('', undefined));
    expect(getFlowchartDesignerComponent('flowchart', 'cloud-copy-a')).toBe(renderer);
  });
  it('keeps the existing canvas mounted when asynchronous document type resolves to the default flowchart', () => {
    const beforeTypeLookup = getFlowchartDesignerComponent(undefined, 'existing-cloud-after-reload');
    expect(getFlowchartDesignerComponent('flowchart', 'existing-cloud-after-reload')).toBe(beforeTypeLookup);
    expect(getFlowchartDesignerComponent('', 'existing-cloud-after-reload')).toBe(beforeTypeLookup);
    expect(getFlowchartDesignerComponent('mindmap', 'existing-cloud-after-reload')).not.toBe(beforeTypeLookup);
    expect(getFlowchartDesignerComponent('flowchart', 'different-cloud-document')).not.toBe(beforeTypeLookup);
  });
  it('mounts the designer so document failures can use its readiness and retry UI', async () => {
    mocks.preset.mockRejectedValue(new Error('controlled document fetch failure'));
    const loaded = await loadFlowchartDesigner('flowchart', 'blank-canvas-template');
    expect(loaded.default).toBeTypeOf('function');
    expect(mocks.plugins).toHaveBeenCalledWith('flowchart');
    expect(mocks.preset).not.toHaveBeenCalled();
  });
  it('still rejects unavailable renderer dependencies', async () => {
    const failure = new Error('controlled plugin failure');
    mocks.plugins.mockRejectedValueOnce(failure);
    await expect(loadFlowchartDesigner('flowchart')).rejects.toBe(failure);
  });
  it('makes the renderer available while optional precompiled-route downloading is still pending', async () => {
    let finishPrefetch!: (value: boolean) => void;
    mocks.route.mockReturnValueOnce(new Promise<boolean>(resolve => { finishPrefetch = resolve; }));
    let renderer: unknown;
    const loaded = loadFlowchartDesigner('flowchart', 'logistics-architecture-v1').then(value => { renderer = value.default; });
    try {
      await vi.waitFor(() => expect(renderer).toBeTypeOf('function'), { timeout: 500, interval: 10 });
      expect(mocks.route).toHaveBeenCalledWith('logistics-architecture-v1');
      expect(mocks.plugins).toHaveBeenCalledWith('flowchart');
    } finally {
      finishPrefetch(true);
      await loaded;
    }
  });
  it('keeps optional route-cache failures from rejecting a ready renderer', async () => {
    mocks.route.mockRejectedValueOnce(new Error('controlled optional route-cache failure'));
    const loaded = await loadFlowchartDesigner('flowchart', 'logistics-architecture-v1');
    expect(loaded.default).toBeTypeOf('function');
    expect(mocks.route).toHaveBeenCalledWith('logistics-architecture-v1');
  });
});
